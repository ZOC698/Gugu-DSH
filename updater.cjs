const https = require('node:https')

const RELEASES_API = 'https://api.github.com/repos/ZOC698/Gugu-DSH/releases/latest'
const RELEASES_PAGE = 'https://github.com/ZOC698/Gugu-DSH/releases/latest'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

function parseVersion(value) {
  const match = String(value ?? '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function compareIdentifiers(left, right) {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null
  if (leftNumber !== null && rightNumber !== null) return Math.sign(leftNumber - rightNumber)
  if (leftNumber !== null) return -1
  if (rightNumber !== null) return 1
  return left.localeCompare(right)
}

function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue)
  const right = parseVersion(rightValue)
  if (left === null || right === null) throw new Error('Invalid semantic version.')
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return Math.sign(left[key] - right[key])
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1
  if (right.prerelease.length === 0 && left.prerelease.length > 0) return -1
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    if (left.prerelease[index] === undefined) return -1
    if (right.prerelease[index] === undefined) return 1
    const result = compareIdentifiers(left.prerelease[index], right.prerelease[index])
    if (result !== 0) return result
  }
  return 0
}

function isPortableBuild(env = process.env) {
  return Boolean(env.PORTABLE_EXECUTABLE_FILE || env.PORTABLE_EXECUTABLE_DIR)
}

function latestReleaseFromPayload(payload) {
  const version = String(payload?.tag_name ?? '').replace(/^v/, '')
  const url = String(payload?.html_url ?? '')
  if (parseVersion(version) === null) throw new Error('GitHub returned an invalid release version.')
  if (!url.startsWith('https://github.com/ZOC698/Gugu-DSH/')) {
    throw new Error('GitHub returned an unexpected release URL.')
  }
  return { version, url }
}

function fetchJson(url, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'Gugu-DSH-Updater',
        'x-github-api-version': '2022-11-28',
      },
    }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        body += chunk
        if (body.length > 1_000_000) request.destroy(new Error('Update response is too large.'))
      })
      response.once('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Update server returned HTTP ${response.statusCode ?? 'unknown'}.`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    })
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Update check timed out.')))
    request.once('error', reject)
  })
}

function createUpdateManager({ app, dialog, shell, getWindow, loadSettings, saveSettings, log, env = process.env, installedUpdater }) {
  const portable = isPortableBuild(env)
  let checking = false
  let manualCheck = false
  let interval
  let autoUpdater = installedUpdater

  const writeLog = message => log?.(`[updater] ${message}`)
  const showMessage = options => dialog.showMessageBox(getWindow(), options)

  async function checkPortable({ manual }) {
    const release = latestReleaseFromPayload(await fetchJson(RELEASES_API))
    const current = app.getVersion()
    if (compareVersions(release.version, current) <= 0) {
      if (manual) {
        await showMessage({ type: 'info', title: '咕嘎 DSH 更新', message: '已经是最新版', detail: `当前版本：${current}` })
      }
      return
    }
    const dismissed = loadSettings().dismissedUpdateVersion
    if (!manual && dismissed === release.version) return
    const result = await showMessage({
      type: 'info',
      title: '咕嘎 DSH 更新',
      message: `发现新版本 ${release.version}`,
      detail: `当前使用的是便携版 ${current}。便携版不会覆盖正在运行的文件，请前往发布页下载新版。`,
      buttons: ['打开下载页', '此版本不再提醒'],
      defaultId: 0,
      cancelId: 1,
    })
    if (result.response === 0) await shell.openExternal(release.url)
    else saveSettings({ dismissedUpdateVersion: release.version })
  }

  function configureInstalledUpdater() {
    if (autoUpdater === undefined) ({ autoUpdater } = require('electron-updater'))
    if (autoUpdater.__guguConfigured) return
    autoUpdater.__guguConfigured = true
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false

    autoUpdater.on('checking-for-update', () => writeLog('checking GitHub Releases'))
    autoUpdater.on('update-available', info => writeLog(`downloading ${info.version}`))
    autoUpdater.on('download-progress', progress => {
      writeLog(`download ${Math.round(progress.percent)}%`)
    })
    autoUpdater.on('update-not-available', async info => {
      writeLog(`up to date (${info.version})`)
      if (manualCheck) {
        manualCheck = false
        await showMessage({ type: 'info', title: '咕嘎 DSH 更新', message: '已经是最新版', detail: `当前版本：${app.getVersion()}` })
      }
    })
    autoUpdater.on('update-downloaded', async info => {
      manualCheck = false
      writeLog(`downloaded ${info.version}`)
      const result = await showMessage({
        type: 'info',
        title: '咕嘎 DSH 更新',
        message: `新版本 ${info.version} 已下载完成`,
        detail: '现在可以重启完成安装；选择“稍后”时，将在正常退出应用后自动安装。',
        buttons: ['立即重启更新', '稍后'],
        defaultId: 0,
        cancelId: 1,
      })
      if (result.response === 0) autoUpdater.quitAndInstall(false, true)
    })
    autoUpdater.on('error', async error => {
      writeLog(`error: ${error instanceof Error ? error.message : String(error)}`)
      if (manualCheck) {
        manualCheck = false
        await showMessage({
          type: 'warning',
          title: '咕嘎 DSH 更新',
          message: '暂时无法检查更新',
          detail: `${error instanceof Error ? error.message : String(error)}\n\n也可以直接访问：${RELEASES_PAGE}`,
        })
      }
    })
  }

  async function check({ manual = false } = {}) {
    if (checking) return
    if (!app.isPackaged) {
      if (manual) await showMessage({ type: 'info', title: '咕嘎 DSH 更新', message: '开发模式不检查更新' })
      return
    }
    checking = true
    try {
      if (portable) {
        await checkPortable({ manual })
      } else {
        configureInstalledUpdater()
        manualCheck = manual
        await autoUpdater.checkForUpdates()
      }
    } catch (error) {
      writeLog(`check failed: ${error instanceof Error ? error.message : String(error)}`)
      if (manual) {
        await showMessage({
          type: 'warning',
          title: '咕嘎 DSH 更新',
          message: '暂时无法检查更新',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      checking = false
    }
  }

  function start() {
    const timer = setTimeout(() => void check(), 12_000)
    timer.unref?.()
    interval = setInterval(() => void check(), CHECK_INTERVAL_MS)
    interval.unref?.()
  }

  function stop() {
    if (interval !== undefined) clearInterval(interval)
  }

  return { check, start, stop, portable }
}

module.exports = {
  RELEASES_API,
  RELEASES_PAGE,
  parseVersion,
  compareVersions,
  isPortableBuild,
  latestReleaseFromPayload,
  createUpdateManager,
}
