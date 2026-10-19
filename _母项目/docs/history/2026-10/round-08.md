# 第 8 轮：给 Web GUI 加「右键引用」插件（含打包版 DSH 的插件调试方法）

日期：2026-10-18
目标：选中 AI 回复文字 → 右键 → 【复制 / 引用到输入框】，引用内容成为下一轮对话依据

**结果：成功。** 但过程极其曲折，教训比代码值钱，故本轮重点记录**调试方法**。

## 一、交付物

| 项 | 位置 |
|---|---|
| 插件源码 | `%USERPROFILE%\Desktop\Agent 项目\引用插件\`（`package.json` + `lib/client.js` + `lib/index.js`） |
| 包解析 | junction → `.dsh\profiles\node_modules\dsh-client-ui-quote` |
| 唯一注册点 | `.dsh\profiles\desktop\cordis.patch.yml` 的 `- insert:` |
| 备份 | 同目录 `cordis.patch.yml.bak-20261018` |

## 二、打包版 DSH 的插件扩展点（源码级证据）

| 事实 | 依据 |
|---|---|
| 桌面应用由 `dsh-desktop-host` 启动，它调 `loadProfileDirectory` + `runProfile` | 从 app.asar 解出 `dsh-desktop-host/lib/index.js` |
| **`loadProfile()` 只读 profile 自己的 `cordis.patch.yml`** | `dsh-app-boot/lib/index.js:871` |
| **`~/.dsh/cordis.patch.yml`（home 层）在本版是死代码** | `homePatchPath()` 全库仅出现在定义处，**零调用** |
| bundle 列表在 profile 的 `package.json` 的 `dsh.profile.bundles` | 同上 |
| CLI 拒绝管理 desktop profile | `dsh --profile desktop --dump-config` → "managed exclusively by the Electron application" |
| 打包版的安装依赖闭包在 **app.asar 内部**，普通 Node 无法复现其解析 | 进程 argv[2] 指向 asar 内的 `dsh` 目录 |

## 三、怎么判断插件到底加载了没有（本轮最值钱的方法）

三层证据，从外到内：

1. **宿主有没有 import 宿主半** → 看 NTFS 访问时间
   ```powershell
   (Get-Item "<插件>\lib\index.js").LastAccessTime   # 应晚于应用启动时间
   ```
   前提：`fsutil behavior query disablelastaccess` 显示 2（System Managed，记录开启）。
   本轮据此证明了「加载链路从来没断」，避免了继续瞎改。

2. **浏览器有没有拿到 bundle** → 看 Electron 的 Code Cache
   ```
   %APPDATA%\@deepseek-ai\dsh-desktop\Code Cache\js\*
   ```
   在里面搜插件特征串（如 `dshq-menu`）。命中 = V8 编译过该脚本。
   本轮据此发现**浏览器一直在跑旧版**，前两次修改根本没到浏览器。

3. **强制重新编译** → 关掉应用后删掉 `Code Cache` 目录（纯缓存，可重建）。
   本轮清掉 101 个文件后，新 bundle 才真正生效。

## 四、自检发现并修掉的问题

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | 改了配置重启无效 | **改错 profile**：人家按"Web GUI"改 `profiles\web\`，实际 `DSH_PROFILE=desktop` | 改 `profiles\desktop\` |
| 2 | 同上 | **时序**：配置写入晚于应用启动 | 比对进程 `StartTime` 与文件 mtime |
| 3 | 同上 | 把条目挪到 home 层 —— **那层是死代码** | 放回 profile 层（源码证实唯一有效） |
| 4 | 插件静默不生效 | `ctx.slots.inject` 回调写成 **generator**，`inject` 把返回值当 disposer 调用 | 改为**箭头函数**返回 `register` 结果（对照 `ui-commands`、`ui-input-trigger` 的真实惯用法） |
| 5 | 仍不生效 | **浏览器缓存旧 bundle**，重启也不重新拉取 | 删 `Code Cache` |
| 6 | 兜底缺失 | 全部赌在「插槽会挂载」上，无法验证 | 改为**双路径**：插槽 + DOM 兜底（只要求 bundle 执行） |
| 7 | 注册可能不完整 | 人家只传 `{ name }`，真实包都带 `id` / `order` | 补 `id: "quote-menu"`, `order: 50` |

## 五、最终设计：双路径

- **路径 A**：注册进 `conversation.input.overlay`（会话作用域），用 props 的
  `useInput((s)=>s.draft)` + `inputActions.setDraft()` 读写草稿（干净）。
- **路径 B**：`apply()` 里直接挂 document 级 `contextmenu` + 纯 DOM 菜单，
  插入走 composer 的 contenteditable（`execCommand`）。**slot 一旦挂载就自动让位**（`slotMounted` 互斥）。

只在**有非空选区**时接管；无选区时保留浏览器原生菜单，避免功能倒退。

## 六、已知限制

1. **不知道最终是 A 还是 B 在生效**（需要看 Console 的 `[引用插件]` 日志才能区分）。
   若是 B，插入依赖 `execCommand`，**草稿状态同步质量尚未端到端验证**。
2. 未写回归测试（本项目没有 scaffold 结构，也没有 `scripts/`）。
3. `引用插件/` 未走脚手架（无 `AGENTS.md`），在项目清单里显示为「❌ 未走脚手架」。
4. 插件**不受版本控制**（子项目目录被母项目 `.gitignore` 的 `/*` 排除，且不能加 `.git`，
   否则会切断母项目规范自动加载 —— 见 `round-04`）。这是个**结构性待决问题**。
5. 仅在 Windows + 本机验证。

## 七、留给下次的

- 端到端验证：右键引用 → 补话 → 发送 → 确认模型真的收到引用内容。
- 决定 `引用插件/` 是否纳入母项目仓库以获得版本控制。
- 母项目还有**一批未提交改动**（`round-06`/`round-07` 起累积），需单独授权提交。
