# 咕嘎 DSH 发布说明（执行文档，供 Codex 使用）

> 目标：把当前最新构建（含"关闭进托盘"功能）发布到 GitHub。
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

- 当前 `package.json` 的 `version` 是 `0.3.1`
- GitHub 上**已存在 `v0.3.0` 的 Release**（同一仓库）
- 本次版本已升级为 `0.3.1`（新增功能 + 修复），避免与已有 tag 冲突。
- 如果版本号再次变化，必须修改 `package.json` 后重新执行第 3 节打包，产物文件名会自动带新版本号。
  - 如果用户明确说继续用 0.3.0（例如他决定删旧 Release），以用户答复为准

---

## 2. 相对 0.3.0 的变更内容（写进 Release Notes）

1. **关闭进托盘**：点击窗口 ✕ 隐藏到系统托盘（后台继续运行，内置 DSH 不受影响）；托盘单击显示主窗口；托盘右键菜单：显示主窗口 / 退出；真退出走菜单"应用 → 退出"或托盘"退出"
2. **修复 `scripts/prepare-runtime.cjs` 的 Windows 潜伏 bug**：`spawnSync('npm.cmd')` 缺少 `shell: true`，在干净克隆上 `npm run pack:win` 必报 `EINVAL`；已修复（Node CVE-2024-27980 加固导致）

---

## 3. 打包命令（生成最终产物）

前置条件：
- `pnpm` 在 PATH（`Get-Command pnpm` 可解析；若不在：`npm install -g pnpm@11.19.0`）
- **关闭正在运行的旧 GUI**（`dist\win-unpacked\Gugu DSH.exe` 若在运行会锁住输出目录，报 `EBUSY`）；用托盘"退出"或任务管理器结束，不要 `taskkill /T` 波及后端进程

```powershell
npm run pack:win
```

产物：
- `dist\Gugu-DSH-<version>-Portable-Windows-x64.exe` —— 便携单文件（对外发布用这个）
- `dist\win-unpacked\` —— 解压即用目录（本机测试用）

发布用**便携单文件**即可（0.3.0 就是这么发的）。

---

## 4. 发布前检查清单（逐项核对，全部通过才能发布）

- [ ] **隐私扫描**：解压产物目录，确认无本机用户目录或工作区绝对路径，无 API Key、访问令牌、密码、Cookie、私钥和本机配置（至少检查 `sk-`、`ghp_`、`github_pat_`、`xox`、`BEGIN * PRIVATE KEY` 等常见特征；重点检查 `resources\app\` 与 `resources\dsh-runtime\`）
- [ ] **运行时纯净**：`resources\dsh-runtime\` 是生成物（含内置 DSH rc.6 与 Node 运行时），确认不含个人配置/凭据
- [ ] **单元测试**：`npm test` 全部通过（当前 8 项）
- [ ] **托盘功能实测**：启动 → 点 ✕ 隐藏到托盘 → 托盘单击恢复 → 托盘"退出"正常退出
- [ ] **SHA-256**：对便携版计算并写入发布资产
- [ ] 不改动当前正在使用的桌面快捷方式；新版完成本机验证后，再由用户决定是否将 `咕嘎 DSH.lnk` 更新到新版

---

## 5. 发布步骤

### 方式 A：GitHub CLI（推荐）

```powershell
# 以 0.3.1 为例；换用实际版本号
$exe = "dist\Gugu-DSH-0.3.1-Portable-Windows-x64.exe"
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash
"$hash  $(Split-Path $exe -Leaf)" | Set-Content dist\SHA256SUMS.txt

gh release create v0.3.1 $exe dist\SHA256SUMS.txt `
  --repo ZOC698/Gugu-DSH `
  --title "咕嘎 DSH 0.3.1" `
  --draft `
  --notes @"
咕嘎 DSH 0.3.1（社区制作，非 DeepSeek 官方发行版）

新增：
- 关闭进托盘：点击 ✕ 隐藏到系统托盘，托盘单击显示、右键退出
修复：
- prepare-runtime 在干净克隆上无法打包的 Windows EINVAL 问题

SHA-256: $hash
"@
```

以上命令只创建 Draft。核对版本号、说明、两个资产、文件大小和 SHA-256 后，必须再次获得用户明确确认，才能执行：

```powershell
gh release edit v0.3.1 --repo ZOC698/Gugu-DSH --draft=false
```

### 方式 B：网页手动发布

1. 打开 https://github.com/ZOC698/Gugu-DSH/releases/new
2. Tag：`v0.3.1`；标题：`咕嘎 DSH 0.3.1`
3. 上传便携版 exe + SHA256 文件
4. Release notes 用第 2、5 节内容
5. 先保存为 Draft；核对完成并获得用户明确确认后再发布

---

## 6. 发布后验证

- [ ] Release 页面状态是 Published（非 Draft）
- [ ] 两个资产（exe + SHA256）可下载，GitHub 显示的大小与本机一致
- [ ] 下载便携版在**新环境**测试：双击 → 自动拉起内置 DSH → 设置→模型填 API Key → 可用（无需装 Node/pnpm/命令行）

---

## 7. 历史背景（避免误操作）

- 曾发布到 `ZOC698/deepseek-harness` fork（tag `gugu-dsh-v0.3.0`），后用户决定独立仓库并迁移到 `ZOC698/Gugu-DSH`
- 用户明确要求**保留** fork，勿删
- 0.3.0 之前的版本（0.2.0 等）与本次发布无关
