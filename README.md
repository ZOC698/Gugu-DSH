# Gugu DSH

咕嘎风格的 DeepSeek Harness 独立 Windows x64 桌面客户端。

Gugu DSH is an independent, Gugu-styled Windows x64 desktop shell for DeepSeek Harness. It is a community project and is not an official DeepSeek release.

## Download / 下载

Download the latest portable build from [GitHub Releases](https://github.com/ZOC698/Gugu-DSH/releases/latest). No separate PowerShell launcher is required.

从 [GitHub Releases](https://github.com/ZOC698/Gugu-DSH/releases/latest) 下载便携版 EXE，无需单独的 PowerShell 启动脚本。

## Connection / 连接逻辑

Connection order:

1. `--dsh-url <url>` command-line option.
2. `GUGU_DSH_URL` environment variable.
3. Last successful DSH WebUI address.
4. Official default `http://127.0.0.1:3080`.
5. Bundled DSH runtime on a free loopback port.

Use **应用 → 连接自定义 DSH 地址…** to connect to another local port. For
security, only loopback addresses are accepted.

## Behavior

- Starts a private DeepSeek Harness Web backend on an available loopback port.
- Opens the Web UI in a sandboxed Electron window.
- Bundles Node.js and the published `@deepseek-ai/dsh` package; PowerShell, pnpm, and a source checkout are not required.
- Stores ordinary DSH settings under the user's existing `%USERPROFILE%\.dsh` directory.
- Stores GUI window state and backend logs under Electron's per-user application-data directory.
- Stops the GUI-owned backend process tree when the window exits.

Existing DSH settings and credentials remain in the user's local `%USERPROFILE%\.dsh` directory. They are read by DSH at runtime and are never bundled into release artifacts.

## Development

```powershell
npm install
npm test
npm start
npm run pack:win
```

`npm run pack:win` prepares an isolated runtime containing Node.js and the pinned `@deepseek-ai/dsh` package before invoking Electron Builder.

The release is unsigned, so Windows SmartScreen may warn on first launch.

## License and attribution

Gugu DSH is released under the MIT License. DeepSeek Harness, Electron, Node.js, and other bundled components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
