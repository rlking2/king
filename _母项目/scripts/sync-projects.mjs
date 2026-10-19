#!/usr/bin/env node
// 母项目 —— 子项目记录同步引擎
//
// 解决的问题：`新建项目.ps1` 生成的项目，母项目记录里没有它自己的条目。
// 以前靠人工「登记子项目」，要逐项授权、还容易漏；本脚本把它变成幂等的一次同步。
//
// 设计原则（与母项目规范一致）：
//   1. 只写【一个】文件：`_母项目\项目清单.md`。**不碰**自动加载的 `AGENTS.md`
//      —— 那文件一坏，所有会话都读不到规范，风险不对称。
//   2. 幂等：内容没变就不写。可以随便重复跑。
//   3. 只改标记块 `<!-- BEGIN AUTO: projects --> … <!-- END AUTO: projects -->` 内的内容，
//      块外的人写文字一律不动。标记不合法（缺失/重复）时**拒绝写入**并退出 1。
//   4. 所有事实现场采集，不读缓存、不猜。
//
// 用法：
//   node _母项目/scripts/sync-projects.mjs            # 同步（幂等）
//   node _母项目/scripts/sync-projects.mjs --dry-run  # 只打印将写入的内容，不落盘
//   node _母项目/scripts/sync-projects.mjs --quiet    # 只在有变化时输出
//
// 退出码：
//   0 = 同步完成（无论是否有变化）
//   1 = 失败（清单或标记不合法、写后核验不通过）

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // …\_母项目\scripts
const MOTHER = resolve(HERE, '..'); // …\_母项目
const ROOT = resolve(MOTHER, '..'); // 工作区根
const LEDGER = join(MOTHER, '项目清单.md');
const BLOCK = 'projects';

const DRY = process.argv.includes('--dry-run');
const QUIET = process.argv.includes('--quiet');

/** 不当作子项目扫描的目录名。 */
const EXCLUDE = new Set(['_母项目']);

/** 判定「脚手架占位还没填」的模式。 */
const TODO_PATTERNS = [
  { re: /\{\{[A-Z_]+\}\}/g, why: '未替换的 {{占位符}}' },
  { re: /（待填写）/g, why: '「（待填写）」' },
  { re: /^[ \t]*-[ \t]*待填写[ \t]*$/gm, why: '「- 待填写」' },
];

const CONTEXT_FILES = ['NOW.md', 'MAP.md', 'RUNBOOK.md', 'DECISIONS.md', 'RISKS.md'];

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 目录的直接子项数。 */
function entryCount(dir) {
  try {
    return readdirSync(dir).length;
  } catch {
    return 0;
  }
}

/** 目录下文件的最新修改时间（限深度，避免翻进 node_modules）。 */
function latestMtime(dir, depth = 3) {
  let best = 0;
  const walk = (d, level) => {
    if (level > depth) return;
    let items;
    try {
      items = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      if (it.name === 'node_modules' || it.name === '.git') continue;
      const full = join(d, it.name);
      try {
        const st = statSync(full);
        if (st.mtimeMs > best) best = st.mtimeMs;
        if (it.isDirectory()) walk(full, level + 1);
      } catch {
        /* 无权访问的条目跳过，不影响结论 */
      }
    }
  };
  walk(dir, 1);
  return best;
}

function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 采集单个项目目录的全部事实。 */
function inspect(name) {
  const dir = join(ROOT, name);
  const hasAgents = existsSync(join(dir, 'AGENTS.md'));
  const hasIndex = existsSync(join(dir, 'PROJECT_INDEX.md'));
  // DSH 判定项目根用的是「存在性」，文件或目录都算 —— 这里保持一致
  const hasGit = existsSync(join(dir, '.git'));

  const context = CONTEXT_FILES.filter((f) => existsSync(join(dir, 'docs', 'context', f)));

  let todos = [];
  if (hasAgents) {
    const text = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    for (const { re, why } of TODO_PATTERNS) {
      const n = (text.match(re) ?? []).length;
      if (n > 0) todos.push(`${why}×${n}`);
    }
  }

  let status;
  if (!hasAgents) status = 'none'; // 未走脚手架
  else if (todos.length > 0) status = 'todo'; // 脚手架但待填
  else status = 'done'; // 已填实

  return {
    name,
    status,
    todos,
    hasAgents,
    hasIndex,
    hasGit,
    context,
    entries: entryCount(dir),
    mtime: latestMtime(dir),
  };
}

function scan() {
  let names;
  try {
    names = readdirSync(ROOT, { withFileTypes: true });
  } catch (e) {
    throw new Error(`无法读取工作区根：${ROOT}\n${e.message}`);
  }
  const out = [];
  for (const it of names) {
    if (!it.isDirectory()) continue;
    if (it.name.startsWith('.')) continue; // .git 等
    if (EXCLUDE.has(it.name)) continue;
    out.push(inspect(it.name));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

const MARK = {
  done: '✅ 已填实',
  todo: '⚠️ 待填',
  none: '❌ 未走脚手架',
};

function renderBlock(all, now) {
  const scaffolded = all.filter((p) => p.hasAgents);
  const plain = all.filter((p) => !p.hasAgents);

  const L = [];
  L.push(`> 最后生成：${now}　|　共 ${all.length} 个目录，其中脚手架项目 **${scaffolded.length}** 个，非脚手架目录 **${plain.length}** 个。`);
  L.push('');
  L.push('### 脚手架项目');
  L.push('');
  L.push('| 项目 | 规范化 | 母项目规范自动加载 | 上下文文件 | 条目 | 最后修改 |');
  L.push('|---|---|---|---|---|---|');
  for (const p of scaffolded) {
    const load = p.hasGit ? '❌ 有 `.git`，被截断' : '✅';
    const note = p.status === 'todo' ? `（${p.todos.join('、')}）` : '';
    const ctx = p.context.length === CONTEXT_FILES.length ? '5/5' : `${p.context.length}/5`;
    L.push(`| \`${p.name}/\` | ${MARK[p.status]}${note} | ${load} | ${ctx} | ${p.entries} | ${fmtTime(p.mtime)} |`);
  }
  L.push('');
  L.push('### 非脚手架目录（未走 `新建项目.ps1`）');
  L.push('');
  if (plain.length === 0) L.push('（无）');
  else {
    L.push('| 目录 | 母项目规范自动加载 | 条目 | 最后修改 |');
    L.push('|---|---|---|---|');
    for (const p of plain) {
      const load = p.hasGit ? '❌ 有 `.git`，被截断' : '✅';
      L.push(`| \`${p.name}/\` | ${load} | ${p.entries} | ${fmtTime(p.mtime)} |`);
    }
  }
  L.push('');
  L.push('**列的判据**（全部现场实测，不是读缓存）：');
  L.push('');
  L.push('- **规范化**：`AGENTS.md` 存在且无待填占位 = 已填实；有占位 = 待填；无 `AGENTS.md` = 未走脚手架。');
  L.push('- **母项目规范自动加载**：DSH 从 cwd 向上找**最近的** `.git` 当项目根，指令链只覆盖「项目根 → cwd」。');
  L.push('  所以**有 `.git` = 被截断 = 读不到母项目规范**，无 `.git` = 正常。见 `docs/history/2026-09/round-04.md`。');
  L.push('- **上下文文件**：`docs/context/` 下 NOW / MAP / RUNBOOK / DECISIONS / RISKS 的现有数量。');
  L.push('- **条目 / 最后修改**：目录直接子项数；子项最新 mtime（深度 ≤3，跳过 `node_modules` 与 `.git`）。');
  return L.join('\n');
}

/** 只替换标记块内的内容；标记缺失或重复时返回 null（调用方据此拒绝写入）。 */
function replaceBlock(text, name, body) {
  const begin = `<!-- BEGIN AUTO: ${name} -->`;
  const end = `<!-- END AUTO: ${name} -->`;
  const b = text.indexOf(begin);
  const e = text.indexOf(end);
  if (b < 0 || e < 0 || e < b) return null;
  if (text.indexOf(begin, b + begin.length) >= 0) return null;
  if (text.indexOf(end, e + end.length) >= 0) return null;
  return `${text.slice(0, b + begin.length)}\n${body}\n${text.slice(e)}`;
}

function main() {
  const all = scan();
  const now = fmtTime(Date.now());
  const body = renderBlock(all, now);

  if (!existsSync(LEDGER)) {
    console.error(`找不到清单文件：${LEDGER}`);
    console.error('请先用模板初始化它（含 BEGIN/END AUTO 标记）。');
    return 1;
  }

  const before = readFileSync(LEDGER, 'utf8');
  const after = replaceBlock(before, BLOCK, body);
  if (after === null) {
    console.error(`清单的 AUTO 标记不合法（缺失或重复）：${LEDGER}`);
    console.error(`需要恰好一对：<!-- BEGIN AUTO: ${BLOCK} --> … <!-- END AUTO: ${BLOCK} -->`);
    return 1;
  }

  const changed = after !== before;

  if (DRY) {
    console.log(`[干跑] 工作区根：${ROOT}`);
    console.log(`[干跑] 将写入：${LEDGER}`);
    console.log(`[干跑] 结果：${changed ? `有变化（${Buffer.byteLength(before, 'utf8')} → ${Buffer.byteLength(after, 'utf8')} B）` : '无变化'}`);
    console.log('--- 拟写入的块内容 ---');
    console.log(body);
    return 0;
  }

  if (changed) {
    writeFileSync(LEDGER, after, 'utf8');
    // 写后核验：标记仍在、块非空。不通过就报错（不静默）。
    const check = readFileSync(LEDGER, 'utf8');
    if (replaceBlock(check, BLOCK, body) === null || check.length < before.length / 2) {
      console.error(`写后核验失败，清单可能已损坏：${LEDGER}`);
      return 1;
    }
  }

  if (!QUIET || changed) {
    console.log(`工作区根：${ROOT}`);
    console.log(`扫描 ${all.length} 个目录 —— 脚手架项目 ${all.filter((p) => p.hasAgents).length} 个，非脚手架 ${all.filter((p) => !p.hasAgents).length} 个`);
    for (const p of all) console.log(`  ${MARK[p.status]}  ${p.name}${p.hasGit ? '   ⚠️ 有 .git，母项目规范会被截断' : ''}`);
    console.log(`清单：${LEDGER}`);
    console.log(changed ? '状态：已更新' : '状态：无变化（幂等）');
  }
  return 0;
}

process.exitCode = main();
