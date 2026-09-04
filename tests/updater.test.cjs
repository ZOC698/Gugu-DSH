const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')
const {
  parseVersion,
  compareVersions,
  isPortableBuild,
  latestReleaseFromPayload,
  createUpdateManager,
} = require('../updater.cjs')

test('parseVersion accepts release tags and prereleases', () => {
  assert.deepEqual(parseVersion('v0.3.2'), { major: 0, minor: 3, patch: 2, prerelease: [] })
  assert.deepEqual(parseVersion('0.1.2-rc.1'), { major: 0, minor: 1, patch: 2, prerelease: ['rc', '1'] })
  assert.equal(parseVersion('latest'), null)
})

test('compareVersions follows semantic version ordering', () => {
  assert.ok(compareVersions('0.3.2', '0.3.1') > 0)
  assert.ok(compareVersions('0.3.2', '0.3.2-rc.1') > 0)
  assert.ok(compareVersions('0.3.2-rc.2', '0.3.2-rc.1') > 0)
  assert.equal(compareVersions('v0.3.2', '0.3.2'), 0)
})

test('portable detection uses electron-builder portable environment', () => {
  assert.equal(isPortableBuild({ PORTABLE_EXECUTABLE_FILE: 'Gugu DSH.exe' }), true)
  assert.equal(isPortableBuild({ PORTABLE_EXECUTABLE_DIR: 'C:\\Apps' }), true)
  assert.equal(isPortableBuild({}), false)
})

test('latestReleaseFromPayload only accepts the project release page', () => {
  assert.deepEqual(latestReleaseFromPayload({
    tag_name: 'v0.3.2',
    html_url: 'https://github.com/ZOC698/Gugu-DSH/releases/tag/v0.3.2',
  }), {
    version: '0.3.2',
    url: 'https://github.com/ZOC698/Gugu-DSH/releases/tag/v0.3.2',
  })
  assert.throws(() => latestReleaseFromPayload({
    tag_name: 'v0.3.2',
    html_url: 'https://example.com/download.exe',
  }), /unexpected release URL/)
})

test('installed updater downloads and restarts when the user accepts', async () => {
  class FakeUpdater extends EventEmitter {
    async checkForUpdates() {
      this.emit('update-available', { version: '0.3.3' })
      this.emit('update-downloaded', { version: '0.3.3' })
    }

    quitAndInstall(isSilent, forceRunAfter) {
      this.installArgs = [isSilent, forceRunAfter]
    }
  }

  const updater = new FakeUpdater()
  const messages = []
  const manager = createUpdateManager({
    app: { isPackaged: true, getVersion: () => '0.3.2' },
    dialog: {
      showMessageBox: async (_window, options) => {
        messages.push(options)
        return { response: 0 }
      },
    },
    shell: { openExternal: async () => {} },
    getWindow: () => ({}),
    loadSettings: () => ({}),
    saveSettings: () => {},
    env: {},
    installedUpdater: updater,
  })

  await manager.check({ manual: true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(updater.autoDownload, true)
  assert.equal(updater.autoInstallOnAppQuit, true)
  assert.equal(updater.allowPrerelease, false)
  assert.deepEqual(updater.installArgs, [false, true])
  assert.match(messages[0].message, /0\.3\.3/)
})
