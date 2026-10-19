# 第 10 轮：母项目真正 git 化 —— 补齐入库、脱敏、公开远端

日期：2026-10-19
目标：把母项目从「有个 `.git` 锚点、零星提交」变成**完整纳入版本管理，并且有公开远端可备份/分享**。
结果：**成功。** 全部提交（含本轮记录）推到 `https://github.com/rlking2/king`（`main`），本机用户名与手机号邮箱已从工作区、历史、提交消息三处清除；fresh clone 复核无泄漏。提交数以 `git log --oneline` 为准，本文不写死。

## 一、起点事实（现场核验，不读旧文档）

| 项 | 实测 |
|---|---|
| 本地仓库 | **早就存在**（不是从零 init），`master`，9 个提交，仅 23 个文件在库 |
| 未入库 | `docs/history/2026-10/round-06..09`、`scripts/`（同步引擎）、`项目清单.md` |
| 远端 | **无**（`git remote -v` 为空） |
| 工具 | 无 `gh`、无 `~/.ssh`、无 `credential.helper` 用户级配置；但**系统**级 `C:/Program Files/Git/etc/gitconfig` 有 `helper=manager` |
| 个人数据 | 8 个文件里共 30+ 处 `C:\Users\<用户名>`；全部 9 个提交的作者/提交者邮箱是 `<手机号>@163.com`（**含手机号**） |

> 也就是说：用户说的「git 化管理」缺的不是 init，而是**收尾（入库）+ 公开（远端）**。

## 二、做法

### 1. 脱敏（公开仓库的硬前提）

| 对象 | 处理 |
|---|---|
| 路径 | `C:\Users\<用户名>` → `%USERPROFILE%`（工作区 + **全部历史**） |
| PowerShell 代码 | 双引号串里改成 `"$env:USERPROFILE\..."`；`.ps1` 注释帮助里的示例同步改 |
| 提交身份 | 作者/提交者都改为 `rlking2 <rlking2@users.noreply.github.com>`（本地 `user.name/email` 也一起改） |
| 提交消息 | 旧消息里的路径用 `--msg-filter` 一并清；新消息不再写数字形式的用户名 |

关键补充：`%USERPROFILE%` **工具不展开**。已在根 `AGENTS.md` 的「路径约定」写明：
先取 `$env:USERPROFILE` 拼成绝对路径，再交给 `read` / `glob` / `grep`。
否则等于把 `round-03` 修好的「子项目会话不能相对路径」缺陷换个形式还回来。

### 2. 历史重写

`git filter-branch`（本机无 `git-filter-repo`），三步分开跑：

| 步 | 过滤器 | 作用 |
|---|---|---|
| 1 | `--tree-filter` + Python | 每个提交的树里替换 `C:\Users\<用户名>` |
| 2 | `--env-filter` | 改写作者/提交者姓名与邮箱 |
| 3 | `--msg-filter` + Python | 改写提交消息里的同一路径 |

用**按字节替换**（Python `bytes.replace`），不动编码、不动 BOM、不动行尾 —— BOM 陷阱因此一次都没触发，`新建项目.ps1` 的 `EF BB BF` 前后不变。

### 3. 其它

- 分支 `master` → **`main`**（对齐 GitHub 默认分支）。
- `core.autocrlf` 设为 **`false`**：行尾按原样入库，`git add` 的 CRLF 警告消失（原先那条「虚警」结论降级为历史记录）。
- 远端 `origin = https://github.com/rlking2/king.git`，`git push -u origin main` **未弹授权**（系统凭据管理器里已有 GitHub 凭据）。

## 三、踩到的四个坑（都会重犯，记下来）

1. **`filter-branch` 走 `sh`，Windows 反斜杠会被吃掉。**
   `C:\Users\...python.exe` 传进去变成 `C:Users...`。→ 脚本路径一律转成正斜杠再传。
2. **`-- -- main` 会被 rev-list 当成「路径 main」**，结果 `Found nothing to rewrite`。
   正确写法是 `-- main`（单层分隔）。
3. **第一次用了 `--all`**，把刚建的 `backup/pre-public` 也重写了，备份当场失效。
   → 从 `refs/original/refs/heads/backup/pre-public` 恢复，之后只重写 `main`。
4. **脱敏脚本会替换掉「讲解脱敏」本身的示例**：README 里那句「原 `C:\Users\<用户名>\...` 全部换成…」
   被替换成「原 `%USERPROFILE%\...` 全部换成 `%USERPROFILE%\...`」（同义反复）。
   → 讲解用的示例改用占位写法 `C:\Users\<用户名>`。

## 四、验证（全部现场实测）

| 检查 | 结果 |
|---|---|
| `git ls-remote origin` | `main` 与本地 `HEAD` **同一个哈希**（当时 `bd7c286…`），推送成功 |
| GitHub API `/commits` | 10 条，首条「第 10 轮：公开前脱敏…」 |
| 历史里的 `<用户名>` / 手机号 | `git log -p --all` **零命中** |
| 提交身份 | 只有 `rlking2 <rlking2@users.noreply.github.com>` |
| fresh clone（临时目录重克隆） | 30 个文件、10 个提交（当时）；**工作区与全历史均零泄漏**；`.git` 包 87.1 KiB |
| 推送保险 | `git push origin backup/pre-public` 被 pre-push hook **拦下**（exit 1） |

## 五、留下的东西与风险

| 项 | 状态 |
|---|---|
| `backup/pre-public` 分支 | **本地旧历史**（含公开前的用户名/邮箱），供回滚；`pre-push` hook 禁止推送它 |
| `.git/hooks/pre-push` | 本地保险，**不在版本库里**，换机/重克隆后需重装 |
| `%USERPROFILE%` 约定 | 依赖 AI 按 `AGENTS.md` 展开；不展开就会读不到文件 |
| 未做 | 没加 `.gitattributes`；没有 `LICENSE`（公开仓库目前等于「保留所有权利」） |
| 未做 | 子项目仍被 `.gitignore` 的 `/*` 规则排除（本轮不改这个边界） |

## 六、回滚

```powershell
# 只看不回滚
git log --oneline backup/pre-public

# 真要退回公开前状态（会把泄漏历史带回，慎用）
git branch -f main backup/pre-public
```

远端若已推送过脱敏历史，回滚后需要强推，属于另一件授权。
