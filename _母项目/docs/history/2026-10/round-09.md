# 第 9 轮：给侧栏加「置顶项目」插件（工作区顺序是怎么落盘的）

日期：2026-10-18
目标：让**当前项目**（`Agent 项目`）固定在工作区列表最上方，并且是**长期**置顶、不是一次性排序

**结果：成功。** 插件已在线生效，`~/.dsh/storages/workspace.json` 的 `workspaceIds` 里
`Agent 项目` 已从第 9 位变成第 1 位。

## 一、先把「置顶」这件事的事实查清楚

| 待验证的说法 | 实测结论 | 依据 |
|---|---|---|
| DSH 有「置顶项目」功能 | **没有** | 工作区 UI 的菜单只有 Rename / Delete；`pinnedSessionIds` 只作用于**会话** |
| 列表顺序从哪来 | 宿主注册表 `workspaceIds`（注释原文 "authoritative display order"） | `.dsh/storages/workspace.json`；`dsh-workspace` 的 `workspaceDomainState` |
| 改顺序的正规接口 | `workspaces.insertBefore(id, anchorId)`；不带 anchor = 挪到末尾 | 客户端 `WorkspaceController` + 宿主 `workspaceRegistry.insertBefore` |
| 能不能直接改 workspace.json | **不能**。`single` 布局的 JSON unit **在内存里持有状态**，每次写都是整文件原子替换 | `dsh-storage-json` 的 `SingleJsonUnit`：`state` 是权威，`publish()` 覆盖文件 |
| 能不能从会话里调宿主 API | **不能**。`POST /api` 与 `GET /` 都返回 401 | 实测：请求要带 `dsh-auth-*` cookie（由进程启动 token 换发） |

结论：只有**客户端**能做这件事 —— 它跑在页面里，和宿主是同源、带 cookie，
`ctx.get("workspaces")` 直接就是带 `insertBefore` 的服务。

## 二、交付物

| 项 | 位置 |
|---|---|
| 插件源码 | `%USERPROFILE%\Desktop\Agent 项目\置顶插件\`（`package.json` + `lib/client.js` + `lib/index.js` + `README.md`） |
| 包解析 | junction → `%USERPROFILE%\.dsh\profiles\node_modules\dsh-client-ui-pin-project` |
| 唯一注册点 | `.dsh\profiles\desktop\cordis.patch.yml` 末尾的 `- insert:` |
| 备份 | 同目录 `cordis.patch.yml.bak-before-pin` |
| 验证脚本 | `置顶插件\scripts\check-bundle.mjs`（算 rev + 抓 bundle） |

## 三、设计取舍

- **置顶 = 集合 + 顺序**：`localStorage["dsh.pin-project.v1"]` 记置顶集合（数组顺序即置顶先后），
  排序本身**写回宿主**，所以重启后仍在最上面，不依赖 localStorage 也能保持位置。
- **没有 slot 可用**：`sidebar.workspaces` 下只暴露 `session.menu.item` / `session.row.action` /
  `directoryFlow`，**项目行没有菜单 slot**，所以用 DOM 注入（右键）。
- **行 → 项目 id 的映射**：项目行有 `data-row-key="workspace:<uuid>"`（未分组行 key 为空串）。
  这是本插件最脆的一环，DSH 改结构就失效，已写进 README 的「已知限制」。
- **首次运行播种**：`DEFAULT_PIN_PATHS` 里写了 `Agent 项目` 的绝对路径，只在
  `localStorage` 里**没有记录**时生效一次；之后取消置顶不会再自己回来。

## 四、这次验证「插件到底加载了没有」的办法

第 8 轮靠 NTFS 访问时间和 Electron Code Cache。这次有更硬的证据：

1. **宿主半加载**：`lib/index.js` 的 `apply()` 往 `%TEMP%\dsh-pin-project-host.log` 写一行时间戳。
   改完 patch **几秒后**文件就出现了 —— 说明本 profile **开着 HMR**，配置改动不用重启就进 Loader
   （与第 8 轮「未启用 HMR 才要重启」的说法对照：这台机器是启用状态）。
2. **浏览器半被宿主登记**：`dsh-client-modules` 的 `rev` 是
   `sha1("plugin-artifact\0" + 各字段<长度>:<值>)`，可以自己算：
   ```powershell
   node "置顶插件\scripts\check-bundle.mjs" "dsh-client-ui-pin-project" "置顶插件\lib\client.js"
   ```
   拿到 `200` + 响应里含 `dshp-menu` = 模块图里已经有这个 bundle。
3. **端到端**：`workspace.json` 的 `workspaceIds` 被改写、`Agent 项目` 排到第 1 —— 这是
   「插件 → insertBefore → 宿主注册表 → 原子落盘」整条链跑通的唯一硬证据。

> 顺带纠正一个容易误判的点：`/plugins/???...` 猜 URL 一律 404，因为响应表是**按完整 URL 精确匹配**的，
> `rev` 算错就是没有这个 key，不是「插件没加载」。

## 五、已知风险

- DOM 选择器（`data-row-key`、`[class*="title"]`）属外部实现细节，DSH 升级后可能失效。
- 置顶集合按浏览器存（localStorage），换 profile / 换机器不跟随。
- 置顶项之间被拖动时，顺序会按置顶先后被拨回去（有意的，但可能不符合直觉）。
