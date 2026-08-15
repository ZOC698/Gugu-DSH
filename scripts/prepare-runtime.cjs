const { copyFileSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const runtimeDir = path.join(projectRoot, 'dsh-runtime');
const nodeLicense = path.join(projectRoot, 'runtime', 'NODE-LICENSE.txt');

rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });

copyFileSync(process.execPath, path.join(runtimeDir, 'node.exe'));
copyFileSync(nodeLicense, path.join(runtimeDir, 'NODE-LICENSE.txt'));

writeFileSync(
  path.join(runtimeDir, 'package.json'),
  `${JSON.stringify({
    name: 'gugu-dsh-runtime',
    private: true,
    version: '0.3.0',
    dependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.6',
    },
  }, null, 2)}\n`,
  'utf8',
);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(
  npmCommand,
  ['install', '--omit=dev', '--no-audit', '--no-fund'],
  { cwd: runtimeDir, stdio: 'inherit' },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
