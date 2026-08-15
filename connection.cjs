const DEFAULT_DSH_URL = 'http://127.0.0.1:3080'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

function normalizeHarnessUrl(value) {
  const raw = String(value ?? '').trim()
  if (raw.length === 0) throw new Error('DSH 地址不能为空。')
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`
  let parsed
  try {
    parsed = new URL(withProtocol)
  } catch {
    throw new Error('DSH 地址格式无效。示例：http://127.0.0.1:3080')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('DSH 地址只支持 http 或 https。')
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error('DSH 地址不能包含用户名或密码。')
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('为保证安全，只允许连接本机 DSH（127.0.0.1、localhost 或 ::1）。')
  }
  if (parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error('请填写 DSH WebUI 根地址，不要包含路径、查询参数或片段。')
  }
  return parsed.origin
}

function dshUrlFromArgs(argv = []) {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--dsh-url') return argv[index + 1]
    if (value.startsWith('--dsh-url=')) return value.slice('--dsh-url='.length)
  }
  return undefined
}

function collectConnectionCandidates({ argv = [], env = {}, lastUrl, defaultUrl = DEFAULT_DSH_URL } = {}) {
  const requested = [
    { source: '启动参数', value: dshUrlFromArgs(argv) },
    { source: '环境变量', value: env.GUGU_DSH_URL },
    { source: '上次连接', value: lastUrl },
    { source: '官方默认', value: defaultUrl },
  ]
  const candidates = []
  const invalid = []
  const seen = new Set()
  for (const item of requested) {
    if (item.value === undefined || String(item.value).trim().length === 0) continue
    try {
      const url = normalizeHarnessUrl(item.value)
      if (seen.has(url)) continue
      seen.add(url)
      candidates.push({ source: item.source, url })
    } catch (error) {
      invalid.push({ source: item.source, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { candidates, invalid }
}

module.exports = {
  DEFAULT_DSH_URL,
  collectConnectionCandidates,
  dshUrlFromArgs,
  normalizeHarnessUrl,
}
