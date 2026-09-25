const { copyFileSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const runtimeDir = path.join(projectRoot, 'dsh-runtime');
const nodeLicense = path.join(projectRoot, 'runtime', 'NODE-LICENSE.txt');
const runtimeLock = path.join(projectRoot, 'runtime', 'DSH-pnpm-lock.yaml');

rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });

copyFileSync(process.execPath, path.join(runtimeDir, 'node.exe'));
copyFileSync(nodeLicense, path.join(runtimeDir, 'NODE-LICENSE.txt'));
copyFileSync(runtimeLock, path.join(runtimeDir, 'pnpm-lock.yaml'));

writeFileSync(
  path.join(runtimeDir, 'package.json'),
  `${JSON.stringify({
    name: 'gugu-dsh-runtime',
    private: true,
    version: '0.3.3',
    dependencies: {
      '@deepseek-ai/dsh': '0.1.1-rc.2',
    },
  }, null, 2)}\n`,
  'utf8',
);

// Keep pnpm's dependency-build policy explicit even though this generated
// package is installed outside the repository workspace. These packages are
// already approved by the repository's pnpm-workspace.yaml.
writeFileSync(
  path.join(runtimeDir, 'pnpm-workspace.yaml'),
  `allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': true
  koffi: true
  node-pty: true
  protobufjs: true
onlyBuiltDependencies:
  - '@deepseek-ai/dsh-subprocess-local'
  - '@google/genai'
  - koffi
  - node-pty
  - protobufjs
`,
  'utf8',
);

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(
  pnpmCommand,
  [
    'install',
    '--prod',
    '--frozen-lockfile',
    '--package-import-method',
    'copy',
    '--config.node-linker=hoisted',
  ],
  // Windows resolves pnpm through its .cmd shim, which spawn() refuses
  // without a shell since the CVE-2024-27980 hardening (EINVAL).
  { cwd: runtimeDir, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

rmSync(path.join(runtimeDir, 'pnpm-workspace.yaml'), { force: true });
rmSync(path.join(runtimeDir, 'pnpm-lock.yaml'), { force: true });
for (const metadata of ['.modules.yaml', '.package-map.json', '.pnpm-workspace-state-v1.json']) {
  rmSync(path.join(runtimeDir, 'node_modules', metadata), { force: true });
}
