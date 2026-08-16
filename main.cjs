const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { app, BrowserWindow, Menu, dialog, shell, Tray, nativeImage } = require('electron')
const { launchBackend, stopBackend, probeHarness } = require('./backend.cjs')
const { DEFAULT_DSH_URL, collectConnectionCandidates, normalizeHarnessUrl } = require('./connection.cjs')

let mainWindow
let backend
let restarting = false
let quitting = false
let backendOrigin

app.setName('Gugu DSH')
const hasLock = app.requestSingleInstanceLock()
if (!hasLock) app.quit()

function appRoot() {
  return app.getAppPath()
}

function runtimeRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dsh-runtime')
    : path.join(appRoot(), 'dsh-runtime')
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'window.json')
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
  } catch { }
  return {}
}

function saveSettings(patch) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify({ ...loadSettings(), ...patch }, null, 2))
  } catch { }
}

function loadWindowBounds() {
  const value = loadSettings()
  if (Number.isFinite(value.width) && Number.isFinite(value.height)) return value
  return { width: 1180, height: 780 }
}

function saveWindowBounds() {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  saveSettings(mainWindow.getBounds())
}

function splash(message, detail = '', options = {}) {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  void mainWindow.loadFile(path.join(appRoot(), 'splash.html'), {
    query: { message, detail, ...options },
  })
}

function installNavigationPolicy(window) {
  const splashUrl = pathToFileURL(path.join(appRoot(), 'splash.html')).href
  const isInternal = url => url.startsWith(splashUrl) || (
    backendOrigin !== undefined && (url === backendOrigin || url.startsWith(`${backendOrigin}/`))
  )
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow' }
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('gugu-dsh://connect')) {
      event.preventDefault()
      void connectCustomHarness(new URL(url).searchParams.get('url') ?? '')
      return
    }
    if (url.startsWith('gugu-dsh://cancel')) {
      event.preventDefault()
      void startHarness()
      return
    }
    if (isInternal(url)) return
    event.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })
}

async function decorateHarnessWindow() {
  if (mainWindow === undefined || mainWindow.isDestroyed() || backendOrigin === undefined) return
  const currentUrl = mainWindow.webContents.getURL()
  if (!(currentUrl === backendOrigin || currentUrl.startsWith(`${backendOrigin}/`))) return

  const iconPath = path.join(appRoot(), 'assets', 'gugu-icon.png')
  const iconData = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`
  const connectionLabel = backend?.attached
    ? `已连接已有 WebUI · ${new URL(backend.url).port || (new URL(backend.url).protocol === 'https:' ? '443' : '80')}`
    : '内置 DSH 模式'
  const styles = `
    :root { --gugu-bar-height: 52px; }
    html, body { background: #20221f !important; }
    body { padding-top: var(--gugu-bar-height) !important; box-sizing: border-box !important; }
    body > #root { height: calc(100vh - var(--gugu-bar-height)) !important; max-height: calc(100vh - var(--gugu-bar-height)) !important; }
    #gugu-dsh-shellbar {
      position: fixed; inset: 0 0 auto 0; height: var(--gugu-bar-height); z-index: 2147483647;
      display: flex; align-items: center; gap: 11px; padding: 0 148px 0 14px;
      color: #fff9ef; background: linear-gradient(90deg, #252724 0%, #2c2e2a 70%, #252724 100%);
      border-bottom: 1px solid rgba(255,255,255,.08); box-shadow: 0 4px 18px rgba(0,0,0,.22);
      font-family: "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
      -webkit-app-region: drag; user-select: none;
    }
    #gugu-dsh-shellbar img { width: 38px; height: 38px; object-fit: cover; border-radius: 50%; border: 2px solid #dff6ff; background: #171815; }
    #gugu-dsh-shellbar .gugu-title { display: flex; flex-direction: column; min-width: 0; line-height: 1.05; }
    #gugu-dsh-shellbar strong { font-size: 15px; font-weight: 750; letter-spacing: .02em; }
    #gugu-dsh-shellbar small { margin-top: 5px; color: #bcbdb7; font-size: 10px; }
    #gugu-dsh-shellbar .gugu-status { margin-left: auto; display: flex; align-items: center; gap: 7px; color: #dcddd7; font-size: 11px; white-space: nowrap; }
    #gugu-dsh-shellbar .gugu-dot { width: 8px; height: 8px; border-radius: 50%; background: #27c5d2; box-shadow: 0 0 12px rgba(39,197,210,.78); }
    #gugu-dsh-shellbar .gugu-beak { width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid #f5a316; filter: drop-shadow(0 2px 2px rgba(0,0,0,.3)); }
  `
  const script = `(() => {
    const styleId = 'gugu-dsh-shell-style'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = ${JSON.stringify(styles)}
      document.head.appendChild(style)
    }
    let bar = document.getElementById('gugu-dsh-shellbar')
    if (!bar) {
      bar = document.createElement('header')
      bar.id = 'gugu-dsh-shellbar'
      document.body.appendChild(bar)
    }
    bar.innerHTML = '<img alt="咕嘎"><span class="gugu-title"><strong>咕嘎 DSH</strong><small>DeepSeek Harness 小窗口</small></span><span class="gugu-status"><i class="gugu-dot"></i>${connectionLabel}</span><i class="gugu-beak"></i>'
    bar.querySelector('img').src = ${JSON.stringify(iconData)}
  })()`
  await mainWindow.webContents.executeJavaScript(script, true)
}

async function startHarness() {
  const settings = loadSettings()
  const { candidates, invalid } = collectConnectionCandidates({
    argv: process.argv.slice(1),
    env: process.env,
    lastUrl: settings.dshUrl,
  })
  const invalidDetail = invalid.length > 0 ? `\n已忽略无效配置：${invalid.map(item => item.source).join('、')}` : ''
  splash('正在寻找 DeepSeek Harness…', `依次检查启动参数、环境变量、上次地址和官方默认 3080。${invalidDetail}`)
  try {
    for (const candidate of candidates) {
      try {
        await probeHarness(candidate.url)
        backend = { url: candidate.url, attached: true, source: candidate.source }
        backendOrigin = candidate.url
        saveSettings({ dshUrl: candidate.url })
        await mainWindow.loadURL(candidate.url)
        return
      } catch { }
    }

    splash('正在启动内置 DeepSeek Harness…', '未检测到 3080 WebUI，首次启动可能需要几十秒。')
    backend = await launchBackend({
      runtimeRoot: runtimeRoot(),
      cwd: app.getPath('documents'),
      logDirectory: path.join(app.getPath('userData'), 'logs'),
      onExit: (code, signal) => {
        if (quitting || restarting) return
        splash('DeepSeek Harness 已停止', `退出码：${code ?? '无'}，信号：${signal ?? '无'}。可通过“应用 → 重启后端”重试。`)
      },
    })
    backendOrigin = backend.url
    await mainWindow.loadURL(backend.url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    splash('DeepSeek Harness 启动失败', message)
    void dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: '咕嘎 DSH',
      message: '咕嘎没能连接 DSH',
      detail: `${message}\n\n日志目录：${path.join(app.getPath('userData'), 'logs')}`,
    })
  }
}

function showConnectionEditor(detail = '支持自定义本机端口，例如 http://127.0.0.1:8080。') {
  const settings = loadSettings()
  splash('连接自定义 DSH WebUI', detail, {
    mode: 'connect',
    address: settings.dshUrl || process.env.GUGU_DSH_URL || DEFAULT_DSH_URL,
  })
}

async function connectCustomHarness(value) {
  let url
  try {
    url = normalizeHarnessUrl(value)
  } catch (error) {
    showConnectionEditor(error instanceof Error ? error.message : String(error))
    return
  }
  splash('正在连接自定义 DSH…', url)
  try {
    await probeHarness(url)
    stopBackend(backend?.child)
    backend = { url, attached: true, source: '手动设置' }
    backendOrigin = url
    saveSettings({ dshUrl: url })
    await mainWindow.loadURL(url)
  } catch {
    showConnectionEditor(`没有在 ${url} 找到 DeepSeek Harness。请检查地址和端口。`)
  }
}

async function restartHarness() {
  if (restarting) return
  restarting = true
  stopBackend(backend?.child)
  backend = undefined
  await new Promise(resolve => setTimeout(resolve, 600))
  restarting = false
  await startHarness()
}

function createMenu() {
  return Menu.buildFromTemplate([
    {
      label: '应用',
      submenu: [
        { label: '重新连接 / 重启后端', accelerator: 'CmdOrCtrl+Shift+R', click: () => void restartHarness() },
        { label: '连接自定义 DSH 地址…', accelerator: 'CmdOrCtrl+Alt+D', click: () => showConnectionEditor() },
        { label: '打开日志目录', click: () => void shell.openPath(path.join(app.getPath('userData'), 'logs')) },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '查看',
      submenu: [
        { role: 'reload', label: '刷新页面' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ])
}

function showMainWindow() {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

let tray
function createTray() {
  // Tray is a nicety, never a requirement: when the icon asset is missing or
  // the tray cannot be created, closing the window simply quits as before.
  try {
    const iconPath = path.join(appRoot(), 'assets', 'gugu.ico')
    if (!fs.existsSync(iconPath)) return
    tray = new Tray(nativeImage.createFromPath(iconPath))
    tray.setToolTip('咕嘎 DSH')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '退出', click: () => { quitting = true; app.quit() } },
    ]))
    tray.on('click', () => showMainWindow())
  } catch { }
}

async function createWindow() {
  const bounds = loadWindowBounds()
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 620,
    title: '咕嘎 DSH',
    icon: path.join(appRoot(), 'assets', 'gugu.ico'),
    backgroundColor: '#20221f',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#252724',
      symbolColor: '#fff9ef',
      height: 52,
    },
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', event => {
    saveWindowBounds()
    // Closing the window hides to the tray instead of quitting; the real
    // exit path is 应用 → 退出 or the tray menu (both set `quitting`).
    if (!quitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (!quitting) splash('界面进程已停止', `原因：${details.reason}`)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    void decorateHarnessWindow()
  })
  installNavigationPolicy(mainWindow)
  Menu.setApplicationMenu(createMenu())
  createTray()
  splash('正在准备桌面窗口…')
  await startHarness()
}

app.on('second-instance', () => {
  if (mainWindow === undefined) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.on('before-quit', () => {
  quitting = true
  saveWindowBounds()
  stopBackend(backend?.child)
})

app.whenReady().then(createWindow).catch(error => {
  dialog.showErrorBox('咕嘎 DSH', error instanceof Error ? error.stack ?? error.message : String(error))
  app.quit()
})

app.on('window-all-closed', () => app.quit())
