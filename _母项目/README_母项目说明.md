# 母项目使用说明

> 给**人**看的完整说明。
> AI 的固定规则在 [`../AGENTS.md`](../AGENTS.md)（自动加载），完整管理细则在 [`AI项目管理细则.txt`](AI项目管理细则.txt)。

## 这是什么

`Agent 项目` 是**母项目**：它不实现任何业务，只负责让之后新建的每个项目**不必重复一开始的规范处理**。

| 能力 | 载体 |
|---|---|
| 给 AI 的固定规则 | `Agent 项目\AGENTS.md`（自动加载） |
| 给你的完整管理细则 | `_母项目\AI项目管理细则.txt` |
| 新项目脚手架 | `_母项目\_模板\` + `_母项目\新建项目.ps1` |
| 跨项目记忆 | Obsidian `DSH` 记忆空间 |

## 文件布局

**根目录只有两个文件**，其余母项目内容全在 `_母项目\` 里：

```
Agent 项目\                     ← 工作区根，也是 DSH 的「项目根」
├─ .git\                        ← 「项目根」锚点；本仓库同时跟踪规范与脚手架
├─ AGENTS.md                    ← 必须在根
├─ .gitignore                   ← 必须在根
├─ _母项目\                     ← 母项目的全部内容
│  ├─ PROJECT_INDEX.md
│  ├─ README_母项目说明.md       ← 本文件
│  ├─ AI项目管理细则.txt
│  ├─ 新建项目.ps1              ← 生成后自动登记
│  ├─ _模板\
│  ├─ scripts\                  ← 同步引擎 sync-projects.mjs
│  ├─ 项目清单.md               ← 【权威】子项目清单（脚本生成）
│  └─ docs\history\
│
└─ <子项目目录…>                 ← **不在此枚举**，清单见 `_母项目\项目清单.md`
```

> ⚠️ 本文件**不再抄写子项目列表**。它以前和根 `AGENTS.md`、`PROJECT_INDEX.md` 各存一份，
> 三份互相漂移（`round-05`、`round-06` 各花一整轮修）。现在只有
> [`项目清单.md`](项目清单.md) 一份，且**由脚本生成**。
>
> 登记 / 更新：`node "$env:USERPROFILE\Desktop\Agent 项目\_母项目\scripts\sync-projects.mjs"`（幂等，已预先授权）

### 为什么 `AGENTS.md` 和 `.gitignore` 不能进 `_母项目\`

DSH 只加载 **「项目根 → 当前会话目录」** 这条链上的 `AGENTS.md`，而"项目根"的判定标记默认是 **`.git`**。

- 会话开在 `Agent 项目\新项目\` 时，链是 `[Agent 项目, 新项目]` —— 只有 `Agent 项目\AGENTS.md` 会被加载。
- 如果 `AGENTS.md` 在 `Agent 项目\_母项目\`，它**不在链上**，规范就不会生效。

所以这两个文件必须在根。`.gitignore` 同理：`/*` 规则只有在根层才作用域正确。
`git init` 本身**只是一个锚点**，不是要你把现有项目提交进去。

### ⚠️ 由此带来的第二层后果：子项目会话里**不能用相对路径访问母项目**

这是 2026-09-27 一轮实测发现的（详见 [`docs/history/2026-09/round-03.md`](docs/history/2026-09/round-03.md)）。

`AGENTS.md` 走的是「项目根 → cwd」链，能跨过子项目；但 **`read`/`glob`/`grep` 走的是 cwd**。
所以在 `Agent 项目\某项目\` 里开会话时：

| 写法 | 结果 |
|---|---|
| `read "_母项目/PROJECT_INDEX.md"` | ❌ 被解析成 `某项目\_母项目\PROJECT_INDEX.md` → not found |
| `read "%USERPROFILE%\Desktop\Agent 项目\_母项目\PROJECT_INDEX.md"` | ✅ 可以 |
| `glob` 把绝对路径写进 `pattern` | ❌ `No files found`（实测复现，非偶发） |
| `glob` 绝对目录放进 `path` 参数 | ✅ 可以 |
| `grep` 的 `path` 用绝对路径 | ✅ 可以 |

**所以**：根 `AGENTS.md` 里指向母项目的路径已全部改为**绝对路径**；
脚手架生成的每个项目，其 `AGENTS.md` 会自动带上「母项目指针」节，写明绝对路径和上述工具用法。
新项目不必再踩这个坑。

（注意这条**只能靠改规范解决，不能靠"养成用绝对路径的习惯"** —— 这正是 round-03 的核心结论。）

## 怎么新建一个项目

```powershell
& "$env:USERPROFILE\Desktop\Agent 项目\_母项目\新建项目.ps1" -Name "项目名" -Description "一句话说明要解决什么问题"
```

或者先进去再跑：

```powershell
cd "$env:USERPROFILE\Desktop\Agent 项目\_母项目"
.\新建项目.ps1 -Name "项目名" -Description "一句话说明要解决什么问题"
```

新项目建在**工作区根**下（`_母项目` 的同级），**不是**建在 `_母项目` 里面。

生成的结构：

```
项目名\
├─ AGENTS.md              ← 项目固定规则（不写进度）
├─ PROJECT_INDEX.md       ← 2–4 KB 索引
├─ README.md              ← 给人看的说明
├─ docs\
│  ├─ context\
│  │  ├─ NOW.md           ← 当前在做什么
│  │  ├─ MAP.md           ← 路径与版本地图
│  │  ├─ RUNBOOK.md       ← 怎么跑、怎么验、怎么回滚
│  │  ├─ DECISIONS.md     ← 设计决策
│  │  └─ RISKS.md         ← 风险与未验证假设
│  └─ history\            ← 归档的逐轮记录
├─ scripts\               ← 验证与构建脚本
├─ artifacts\             ← 中间产物（不进版本库）
└─ .gitignore
```

| 参数 | 说明 |
|---|---|
| `-Name` | 必填。项目目录名 |
| `-Description` | 选填。写进 `PROJECT_INDEX.md` 和 `README.md` 的项目定位 |
| `-Git` | 选填。顺带执行 `git init`（**不会** add/commit） |

生成后**先去填 `AGENTS.md` 里的代码约定、安全边界和最小验收** —— 那几处是 `TODO` 占位，不填的话新项目等于没规范。

## ⚠️ 本机陷阱：中文 `.ps1` 必须带 UTF-8 BOM

**这是本机最容易踩的坑，务必记住。**

本机**只有 Windows PowerShell 5.1**（没有 PowerShell 7）。它读 `.ps1` 时默认按 ANSI(GBK) 解码，
所以**含中文且无 BOM 的 `.ps1` 不是"显示乱码"，而是直接语法报错**：

```
The string is missing the terminator: '
ParserError
```

实测对照（同一个文件内容，只差 BOM）：

| 文件 | 运行结果 |
|---|---|
| 无 BOM | `Write-Output '妯℃澘鐩綍涓嶅瓨鍦?` → **ParserError，脚本根本跑不了** |
| 有 BOM | `模板目录不存在` → 正常 |

**规则**：

- `_母项目\新建项目.ps1` **必须带 BOM**。任何工具写入或编辑它之后，都要补回 BOM。
- `.md` / `.txt` **不需要** BOM（DSH 按 UTF-8 读）。
- 很多编辑器/工具保存 UTF-8 时默认**不加** BOM，会静默破坏这个脚本。

补 BOM 的一行命令：

```powershell
$p = '_母项目\新建项目.ps1'
$t = [System.IO.File]::ReadAllText($p, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($true)))
```

核对前三字节应为 `EF BB BF`：

```powershell
(([System.IO.File]::ReadAllBytes('_母项目\新建项目.ps1'))[0..2] | % { $_.ToString('X2') }) -join ' '
```

### 附：`git add` 的 CRLF 警告是虚警（2026-09-27 实测）

> **2026-10-19 更新**：仓库已设 `core.autocrlf=false`，行尾按原样入库（LF 保持 LF、CRLF 保持 CRLF），
> 所以 `git add` **不再**报 CRLF 警告。下面这段保留为历史结论。

`core.autocrlf=true` 会让 `git add` 报 `LF will be replaced by CRLF`。
**已实测为虚警**：克隆后 `.ps1` 行尾变为 CRLF，但 **BOM 保留、中文完好、脚本能正常跑**。无需处理。

### 公开仓库与脱敏（2026-10-19）

母项目的版本库**已推到 GitHub 公开仓库** `https://github.com/rlking2/king`（`origin/main`）。

| 项 | 做法 |
|---|---|
| 路径 | 原 `C:\Users\<用户名>\...` 全部换成 `%USERPROFILE%\...`；**工具不展开它**，要先用 `$env:USERPROFILE` 拼出绝对路径 |
| 提交身份 | `rlking2@users.noreply.github.com`（noreply，避免真实邮箱进公开历史） |
| 历史 | 整体重写以清掉旧路径/旧邮箱，**旧提交哈希因此全部失效** |
| 回退 | 重写前的历史留在本地分支 `backup/pre-public`，**只本地、不推** |
| 推送 | `git push origin main`（用系统 `credential.helper=manager`，首次会弹浏览器授权） |

> 重写后**任何文档都不要再引用旧哈希**。里程碑按提交标题找：`git log --oneline --grep='第 [0-9]* 轮'`。

### 附：触发计数（截至 2026-09-27）

本 BOM 陷阱已**三次**触发，全部由 `edit`/`write` 类操作抹掉 BOM 引起：
第 2 轮批量替换、第 3 轮编辑脚本、第 4 轮编辑脚本。三次补回后均正常。

## 四个决定（已定，记录在此备查）

| 决定 | 选择 | 理由 |
|---|---|---|
| 规范来源 | 审计并修正你已填充的细则 | 细则第 4–7、8–10 条质量高，可直接作骨干 |
| 现有项目（2026-09-27 决定时 3 个） | **保持原位**，规范只对新项目生效 | 零风险。新旧结构不统一，已在 `AGENTS.md` 写明 |
| 自动加载锚点 | 根目录 `git init` | 让子目录会话也能继承规范 |
| 命名与归拢 | `Codex` 统一改为 **`DSH`**；母项目文件全部归入 `_母项目\` | 匹配当前环境；根目录只剩技术必需的 2 个文件 |

## 现有项目为什么没被重构

`桌宠/`、`信号与系统实验/` 都是**规范之前**建立的，各有自己的习惯（`devlog/`、`notes_核心内容.md`）。重构它们风险大于收益，所以：

> **2026-09-29 更新**：本节原列为三个项目，其中 `王国保卫战1重铸（ReBBBorn）+多倍速mod\` **已由用户删除**（当日确认），
> `测试项目\` 同样已删除。`AGENTS.md`、`PROJECT_INDEX.md` 与本文件布局图已同步为两个。
> 详见 [`docs/history/2026-09/round-05.md`](docs/history/2026-09/round-05.md)。

- 母项目仓库通过 `.gitignore` 的 `/*` 规则**不跟踪**它们
- 它们**不会**被改动
- 新规范只对**之后新建的项目**生效

其中 `桌宠/` 自带 `.git`，如果纳入母项目仓库会变成"内嵌仓库"，所以现在是显式排除的。

## 跨项目记忆（Obsidian）

路径：`%USERPROFILE%\Documents\Obsidian Vault\DSH`

| 路径 | 放什么 |
|---|---|
| `AGENTS.md` | 记忆空间的固定操作与路由规则 |
| `TODO.md` | 跨项目待办（只放需要跨项目协调或你关注的事） |
| `people/` | 人员背景 |
| `projects/` | 项目仪表盘（跨项目摘要 + 入口链接，**不复制**项目内部内容） |
| `agent/` | 配置与可复用经验 |
| `notes/` | 每日笔记、想法、归档 |

在 Obsidian 里打开 vault（`Documents\Obsidian Vault`）后，`DSH` 文件夹会直接出现在左侧文件树里。

**读取纪律**：按关键词搜索命中章节，不默认全文读取 `TODO.md` 和全部项目页。

> 注：该目录原名为 `Codex`，2026-09-27 随命名统一改为 `DSH`。Obsidian 侧只需重新打开 vault，无需其他操作。

## 审计记录：细则原来有什么问题

2026-09-27 核验发现并已修正：

| # | 问题 | 处理 |
|---|---|---|
| 1 | 第 1 条路径写成 `C:\Use用户名\Documents\ObsidianVault\Codex` —— **占位符 `Use用户名` 没替换**，且 `ObsidianVault` 这个目录根本不存在 | 改为核验后的真实路径 `%USERPROFILE%\Documents\Obsidian Vault\DSH`（注意 vault 真名**有空格**，且不是 `ObsidianVault`） |
| 2 | 第 8 条（ClawBot 微信通知）两处写的是"此处为文件路径"，占位符未填，还多一个游离反引号；全用户目录搜 `*clawbot*` **零结果** | 按决定**删除该条**，后续条目重编号为 8/9/10 |
| 3 | 第 9 条曾写"已经获得的阶段授权按第 9 条执行"——删条后**交叉引用失效**（阶段授权已变成第 8 条） | 改为"按第 8 条执行" |
| 4 | 细则第 7、8 条主语写「Codex」，Obsidian 记忆空间目录也叫 `Codex`，但本环境是 DSH | 已**统一改为 `DSH`**（含目录改名） |

**尚未处理（等你决定）**：

- 细则文件名是 `.txt`，正文却是 Markdown 语法。是否改名为 `.md`？
- 细则第 4 条要求"项目级 `AGENTS.md` 不保存当前进度"，而现有两个项目（`桌宠/devlog/`、`信号与系统实验/notes_核心内容.md`）**全是**进度型记录 —— 已按你的选择"以细则结构为主干，devlog 归入 `history/`"处理，即**新项目**遵循细则。
- 细则文件是 **UTF-8 无 BOM**。记事本能正常识别，但 PowerShell 5.1 的 `Get-Content` 默认按 ANSI 读会中文乱码 —— 读它请用 `Get-Content -Encoding UTF8`。

## 日常怎么用

| 场景 | 做法 |
|---|---|
| 新项目 | 跑 `_母项目\新建项目.ps1 -Name "..."`，然后填 `AGENTS.md` 的三处 TODO |
| 接着上次做 | 不用交代背景。开新会话时 `AGENTS.md` 自动加载，先说"读 `_母项目\PROJECT_INDEX.md`"即可 |
| 会话太长 | 我会按换窗规则主动提醒你新开任务（2–3 个可验收功能 / 2–3 次压缩 / 60–90 分钟 / 换工作域） |
| 跨项目的事 | 记到 Obsidian `DSH/TODO.md` |
| 改进规范 | 改 `AGENTS.md`（固定规则）或 `_母项目\AI项目管理细则.txt`（完整细则），**不要**把进度写进去 |
| 母项目自己的历史 | `_母项目\docs\history\`，按月分子目录 |
