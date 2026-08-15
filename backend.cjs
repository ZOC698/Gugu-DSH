const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate a local TCP port.')))
        return
      }
      const { port } = address
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

function probeHttp(url, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      response.resume()
      response.once('end', () => {
        if (response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 500) {
          resolve(response.statusCode)
        } else {
          reject(new Error(`HTTP ${response.statusCode ?? 'unknown'}`))
        }
      })
    })
    request.setTimeout(timeoutMs, () => request.destroy(new Error('HTTP probe timed out.')))
    request.once('error', reject)
  })
}

function probeHarness(url, timeoutMs = 2_500) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        if (body.length < 128_000) body += chunk
      })
      response.once('end', () => {
        const status = response.statusCode ?? 0
        if (status >= 200 && status < 500 && /deepseek|dsh/i.test(body)) {
          resolve(status)
        } else {
          reject(new Error(`Port responded but is not DeepSeek Harness (HTTP ${status || 'unknown'}).`))
        }
      })
    })
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Existing WebUI probe timed out.')))
    request.once('error', reject)
  })
}

async function waitForHttp(url, child, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = new Error('Backend has not responded yet.')
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`DeepSeek Harness exited during startup with code ${child.exitCode}.`)
    }
    try {
      await probeHttp(url)
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`DeepSeek Harness did not become ready within ${Math.round(timeoutMs / 1000)} seconds: ${lastError.message}`)
}

function resolveRuntimePaths(runtimeRoot) {
  const nodeExecutable = path.join(runtimeRoot, 'node.exe')
  const dshEntry = path.join(runtimeRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return { nodeExecutable, dshEntry }
}

function assertRuntimeFiles(paths) {
  for (const [label, target] of Object.entries(paths)) {
    if (!fs.existsSync(target)) throw new Error(`Missing packaged ${label}: ${target}`)
  }
}

async function launchBackend({ runtimeRoot, cwd, logDirectory, onExit }) {
  const runtime = resolveRuntimePaths(runtimeRoot)
  assertRuntimeFiles(runtime)
  fs.mkdirSync(logDirectory, { recursive: true })
  const logPath = path.join(logDirectory, 'backend.log')
  const log = fs.createWriteStream(logPath, { flags: 'a' })
  log.write(`\n[${new Date().toISOString()}] Starting DeepSeek Harness GUI backend\n`)

  const port = await findFreePort()
  const url = `http://127.0.0.1:${port}`
  const child = spawn(runtime.nodeExecutable, [runtime.dshEntry, 'web', '--host', '127.0.0.1', '--port', String(port)], {
    cwd,
    env: { ...process.env, DSH_GUI_HOST: 'electron' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  child.once('error', error => log.write(`[launcher error] ${error.stack ?? error.message}\n`))
  child.once('exit', (code, signal) => {
    log.write(`[${new Date().toISOString()}] Backend exited code=${code} signal=${signal}\n`)
    log.end()
    onExit?.(code, signal)
  })

  try {
    await waitForHttp(url, child)
    return { child, url, port, logPath }
  } catch (error) {
    stopBackend(child)
    throw error
  }
}

function stopBackend(child) {
  if (child === undefined || child.exitCode !== null || child.killed) return
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
  } else {
    child.kill('SIGTERM')
  }
}

module.exports = {
  findFreePort,
  probeHttp,
  probeHarness,
  waitForHttp,
  resolveRuntimePaths,
  assertRuntimeFiles,
  launchBackend,
  stopBackend,
}
