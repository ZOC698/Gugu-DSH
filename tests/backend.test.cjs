const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const test = require('node:test')
const { buildDshArgs, findFreePort, probeHttp, probeHarness, resolveRuntimePaths } = require('../backend.cjs')
const { DEFAULT_DSH_URL, collectConnectionCandidates, dshUrlFromArgs, normalizeHarnessUrl } = require('../connection.cjs')

test('findFreePort returns a bindable loopback port', async () => {
  const port = await findFreePort()
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536)
  const server = http.createServer((_request, response) => response.end('ok'))
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', error => error ? reject(error) : resolve()))
  await new Promise(resolve => server.close(resolve))
})

test('probeHttp accepts a local HTTP response', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ready')
  })
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
  const address = server.address()
  assert.notEqual(address, null)
  assert.equal(typeof address, 'object')
  assert.equal(await probeHttp(`http://127.0.0.1:${address.port}`), 200)
  await new Promise(resolve => server.close(resolve))
})

test('probeHarness recognizes a DeepSeek Harness page', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<title>DeepSeek Harness</title>')
  })
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
  const address = server.address()
  assert.notEqual(address, null)
  assert.equal(typeof address, 'object')
  assert.equal(await probeHarness(`http://127.0.0.1:${address.port}`), 200)
  await new Promise(resolve => server.close(resolve))
})

test('resolveRuntimePaths stays inside the dedicated runtime root', () => {
  const root = path.resolve('dsh-runtime')
  const paths = resolveRuntimePaths(root)
  assert.equal(paths.nodeExecutable, path.join(root, 'node.exe'))
  assert.equal(paths.dshEntry, path.join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
})

test('buildDshArgs prevents the embedded backend from opening a browser', () => {
  assert.deepEqual(buildDshArgs('C:\\runtime\\bin.js', 12345), [
    'C:\\runtime\\bin.js',
    'web',
    '--no-open',
    '--host',
    '127.0.0.1',
    '--port',
    '12345',
  ])
})

test('normalizeHarnessUrl accepts local addresses and normalizes their origins', () => {
  assert.equal(normalizeHarnessUrl('127.0.0.1:8080'), 'http://127.0.0.1:8080')
  assert.equal(normalizeHarnessUrl('http://localhost:3080/'), 'http://localhost:3080')
  assert.equal(normalizeHarnessUrl('http://[::1]:4090'), 'http://[::1]:4090')
})

test('normalizeHarnessUrl rejects remote hosts, credentials, and paths', () => {
  assert.throws(() => normalizeHarnessUrl('https://example.com'), /只允许连接本机/)
  assert.throws(() => normalizeHarnessUrl('http://user:pass@127.0.0.1:3080'), /用户名或密码/)
  assert.throws(() => normalizeHarnessUrl('http://127.0.0.1:3080/private'), /根地址/)
})

test('dshUrlFromArgs supports split and equals syntax', () => {
  assert.equal(dshUrlFromArgs(['--dsh-url', 'http://127.0.0.1:8080']), 'http://127.0.0.1:8080')
  assert.equal(dshUrlFromArgs(['--dsh-url=http://127.0.0.1:9090']), 'http://127.0.0.1:9090')
})

test('connection candidates honor precedence and remove duplicates', () => {
  const result = collectConnectionCandidates({
    argv: ['--dsh-url=http://127.0.0.1:8080'],
    env: { GUGU_DSH_URL: 'http://127.0.0.1:9090' },
    lastUrl: 'http://127.0.0.1:3080',
  })
  assert.deepEqual(result.candidates, [
    { source: '启动参数', url: 'http://127.0.0.1:8080' },
    { source: '环境变量', url: 'http://127.0.0.1:9090' },
    { source: '上次连接', url: DEFAULT_DSH_URL },
  ])
})
