# 咕嘎 DSH 发布说明（执行文档，供 Codex 使用）

> 目标：把当前最新构建（含自动更新与新版 DSH 运行时）发布到 GitHub。
> 执行者：Codex。请按本文件的顺序执行，逐项核对检查清单，任何不确定先问用户。

---

## 0. 发布目标仓库

- **唯一发布目标**：`https://github.com/ZOC698/Gugu-DSH`（独立仓库，`isFork: false`）
- **禁止**：
  - 不要动 `ZOC698/deepseek-harness`（用户决定保留的 fork，曾用于旧版发布）
  - 不要动官方 `deepseek-ai/deepseek-harness`
  - 不要向任何仓库提交/推送个人脚本、API Key、私钥、本机绝对路径

本文所有命令均假定 PowerShell 已位于仓库根目录，不在文档中记录本机绝对路径。

---

## 1. 版本号（发布前必须处理）

- 当前 `package.json` 的 `version` 是 `0.3.2`
- GitHub 上**已存在 `v0.3.0` 的 Release**（同一仓库）
- 本次版本已升级为 `0.3.2`（自动更新 + DSH 兼容升级），避免与已有 tag 冲突。
- 如果版本号再次变化，必须修改 `package.json` 后重新执行第 3 节打包，产物文件名会自动带新版本号。
  - 如果用户明确说继续用 0.3.0（例如他决定删旧 Release），以用户答复为准

---

## 2. 相对 0.3.1 的变更内容（写进 Release Notes）

1. **安装版自动更新**：从 `ZOC698/Gugu-DSH` 的 GitHub Releases 检查、后台下载，并提示一键重启安装。
2. **便携版更新提醒**：检测到新版本后打开经过固定域名校验的项目 Release 页面，不尝试覆盖运行中的单文件程序。
3. **手动与周期检查**：应用菜单和托盘菜单均可手动检查；启动后和每六小时自动检查。
4. **官方运行时升级**：内置 `@deepseek-ai/dsh` 从 `0.1.0-rc.6` 升至 `0.1.1-rc.2`，发布前必须完成隔离兼容测试。

---

## 3. 打包命令（生成最终产物）

前置条件：
- `pnpm` 在 PATH（`Get-Command pnpm` 可解析；若不在：`npm install -g pnpm@11.19.0`）
- **关闭正在运行的旧 GUI**（`dist\win-unpacked\Gugu DSH.exe` 若在运行会锁住输出目录，报 `EBUSY`）；用托盘"退出"或任务管理器结束，不要 `taskkill /T` 波及后端进程

```powershell
npm run pack:win
```

产物：
- `dist\Gugu-DSH-<version>-Setup-Windows-x64.exe` —— 安装版（支持自动更新，推荐）
- `dist\Gugu-DSH-<version>-Portable-Windows-x64.exe` —— 便携单文件（更新提醒 + 手动替换）
- `dist\latest.yml` 与安装版 `.blockmap` —— 自动更新必需元数据，必须与同一次构建的安装版一起发布
- `dist\win-unpacked\` —— 解压即用目录（本机测试用）

发布必须包含安装版、便携版、`latest.yml`、安装版 `.blockmap` 和校验文件；缺少或混用旧构建的更新元数据会导致自动更新失败。

---

## 4. 发布前检查清单（逐项核对，全部通过才能发布）

- [ ] **隐私扫描**：解压产物目录，确认无本机用户目录或工作区绝对路径，无 API Key、访问令牌、密码、Cookie、私钥和本机配置（至少检查 `sk-`、`ghp_`、`github_pat_`、`xox`、`BEGIN * PRIVATE KEY` 等常见特征；重点检查 `resources\app\` 与 `resources\dsh-runtime\`）
- [ ] **运行时纯净**：`resources\dsh-runtime\` 是生成物（含内置 DSH 0.1.1-rc.2 与 Node 运行时），确认不含个人配置/凭据
- [ ] **单元测试**：`npm test` 全部通过
- [ ] **更新元数据**：检查 `latest.yml` 指向本次安装版，版本、文件名、大小与 SHA-512 均来自同一次构建
- [ ] **自动更新实测**：至少用一个低版本安装版连接测试 Release，验证发现、下载、重启安装；便携版验证只打开 `ZOC698/Gugu-DSH` 发布页
- [ ] **托盘功能实测**：启动 → 点 ✕ 隐藏到托盘 → 托盘单击恢复 → 托盘"退出"正常退出
- [ ] **SHA-256**：对便携版计算并写入发布资产
- [ ] 不改动当前正在使用的桌面快捷方式；新版完成本机验证后，再由用户决定是否将 `咕嘎 DSH.lnk` 更新到新版

---

## 5. 发布步骤

### 方式 A：GitHub CLI（推荐）

```powershell
# 以 0.3.2 为例；换用实际版本号
$assets = Get-Item dist\Gugu-DSH-0.3.2-Setup-Windows-x64.exe, dist\Gugu-DSH-0.3.2-Setup-Windows-x64.exe.blockmap, dist\Gugu-DSH-0.3.2-Portable-Windows-x64.exe, dist\latest.yml
$assets | ForEach-Object { "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash, $_.Name } | Set-Content dist\SHA256SUMS.txt

gh release create v0.3.2 $assets.FullName dist\SHA256SUMS.txt `
  --repo ZOC698/Gugu-DSH `
  --title "咕嘎 DSH 0.3.2" `
  --draft `
  --notes @"
咕嘎 DSH 0.3.2（社区制作，非 DeepSeek 官方发行版）

新增：
- 安装版自动检查、下载并一键重启更新
- 便携版安全更新提醒
升级：
- 内置 @deepseek-ai/dsh 0.1.1-rc.2

SHA-256 见 SHA256SUMS.txt
"@
```

以上命令只创建 Draft。核对版本号、说明、全部更新资产、文件大小和 SHA-256 后，必须再次获得用户明确确认，才能执行：

```powershell
gh release edit v0.3.2 --repo ZOC698/Gugu-DSH --draft=false
```

### 方式 B：网页手动发布

1. 打开 https://github.com/ZOC698/Gugu-DSH/releases/new
2. Tag：`v0.3.2`；标题：`咕嘎 DSH 0.3.2`
3. 上传安装版、安装版 blockmap、便携版、`latest.yml` 与 SHA256 文件
4. Release notes 用第 2、5 节内容
5. 先保存为 Draft；核对完成并获得用户明确确认后再发布

---

## 6. 发布后验证

- [ ] Release 页面状态是 Published（非 Draft）
- [ ] 五个资产（安装版、blockmap、便携版、`latest.yml`、SHA256）可下载，GitHub 显示的大小与本机一致
- [ ] 下载便携版在**新环境**测试：双击 → 自动拉起内置 DSH → 设置→模型填 API Key → 可用（无需装 Node/pnpm/命令行）

---

## 7. 历史背景（避免误操作）

- 曾发布到 `ZOC698/deepseek-harness` fork（tag `gugu-dsh-v0.3.0`），后用户决定独立仓库并迁移到 `ZOC698/Gugu-DSH`
- 用户明确要求**保留** fork，勿删
- 0.3.0 之前的版本（0.2.0 等）与本次发布无关
