const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const args = process.argv.slice(2)
if (args[0] === '--') args.shift()
const executable = path.resolve(args[0] || path.join('dist', 'win-unpacked', 'Gugu DSH.exe'))
const harnessUrl = args[1] || 'http://127.0.0.1:3080'
const waitMs = Number(args[2] || 20_000)

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function probe(url, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      response.resume()
      response.once('end', () => resolve(response.statusCode ?? 0))
    })
    request.setTimeout(timeoutMs, () => request.destroy(new Error('HTTP probe timed out.')))
    request.once('error', reject)
  })
}

function findFiles(root, name, found = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) findFiles(target, name, found)
    else if (entry.name === name) found.push(target)
  }
  return found
}

async function main() {
  if (!fs.existsSync(executable)) throw new Error(`Packaged executable not found: ${executable}`)
  const initialStatus = await probe(harnessUrl)
  if (initialStatus !== 200) throw new Error(`Existing DSH returned HTTP ${initialStatus}.`)

  const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gugu-dsh-packaged-smoke-'))
  const appData = path.join(smokeRoot, 'AppData', 'Roaming')
  const localAppData = path.join(smokeRoot, 'AppData', 'Local')
  fs.mkdirSync(appData, { recursive: true })
  fs.mkdirSync(localAppData, { recursive: true })

  const child = spawn(executable, [`--user-data-dir=${path.join(smokeRoot, 'Chromium')}`], {
    env: {
      ...process.env,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      USERPROFILE: smokeRoot,
      HOME: smokeRoot,
      GUGU_DSH_URL: harnessUrl,
    },
    windowsHide: true,
    stdio: 'ignore',
  })

  try {
    await wait(waitMs)
    if (child.exitCode !== null) throw new Error(`Packaged app exited early with code ${child.exitCode}.`)
    const logs = findFiles(smokeRoot, 'desktop.log')
    const logTails = logs.map(file => ({
      file,
      tail: fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(-10),
    }))
    console.log(JSON.stringify({
      executable,
      pid: child.pid,
      processAlive: true,
      harnessUrl,
      initialStatus,
      smokeRoot,
      logTails,
    }, null, 2))
  } finally {
    if (child.exitCode === null && child.pid !== undefined) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    }
  }

  const finalStatus = await probe(harnessUrl)
  if (finalStatus !== 200) throw new Error(`Existing DSH was affected by smoke test (HTTP ${finalStatus}).`)
  console.log(`Existing DSH after test: HTTP ${finalStatus}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
