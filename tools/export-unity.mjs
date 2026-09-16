/**
 * 把游戏数据导成 Unity 能直接吃的 JSON + C# 数据类。
 *
 *   node tools/export-unity.mjs          导出到 export/unity/
 *   node tools/export-unity.mjs --check  只校验，不写文件（给 npm run test:unity 用）
 *
 * 做法跟 test-logic.mjs 一样：把 src 下的数据模块塞进一个假 window 里跑一遍，
 * 然后把 ZX.* 上挂好的成品数据序列化出来。所以导出的是「模块加载完成后」的数据——
 * 怪物的经验/金钱/攻速这些派生字段在 monsters.js 里是加载时算的，这里已经算完了，
 * Unity 拿到的是终值，不用把公式再翻一遍。
 *
 * 结构改写（JsonUtility 不支持字典和顶层数组，只能迁就它）：
 *   map.decor  {tree:26,...}     → [{kind:'tree',count:26},...]
 *   map.lv     [1,5]             → lvMin / lvMax
 *   QUALITY    {common:{...},...} → [{key:'common',...},...]
 *   可选的对象字段补一个 present 标记，缺席的数组字段补成 []——见 normalizeForUnity
 *
 * 数据改了就重跑一次：C# 字段表是照着数据生成的，不跟着跑会对不上。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { inferSchema, emitDataFile } from './unity-codegen.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'export', 'unity');
const CHECK_ONLY = process.argv.includes('--check');

// ── 把数据模块跑起来 ──────────────────────────────────────────

/** 只加载数据相关的模块；渲染和界面不碰，main.js 更不能碰（一进来就开游戏循环） */
const MODULES = [
  'src/config.js', 'src/util.js', 'src/stats.js',
  'src/data/sects.js', 'src/data/items.js', 'src/data/monsters.js',
  'src/data/maps.js', 'src/data/npcs.js', 'src/data/quests.js',
];

function loadGameData() {
  const sandbox = { console, Math, Date, JSON, isFinite, parseInt, parseFloat };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  for (const rel of MODULES) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    try {
      vm.runInContext(code, sandbox, { filename: rel });
    } catch (e) {
      console.error('✗ 模块加载失败：' + rel + '\n  ' + e.message);
      process.exit(1);
    }
  }
  return sandbox.ZX;
}

// ── 结构改写 ──────────────────────────────────────────────────

/**
 * 给「有的记录有、有的记录没有」的对象字段打一个 present 标记。
 *
 * JS 里判断一件装备有没有主动效果就是 `if (item.active)`，到了 Unity 这招失效：
 * JsonUtility 不给可序列化类留 null，JSON 里没有的字段会变成一个字段全是 0 的实例。
 * 于是「没有主动效果」和「有一个数值恰好都是 0 的效果」长得一模一样。
 * 有这个标记，C# 侧就能写 `if (item.active.present)`。
 *
 * 数组字段则是另一套办法：JS 里 8 个不卖东西的 NPC 压根没写 stock，JSON 里这个键
 * 就不存在。Unity 侧那个字段是 null 还是空数组，取决于 JsonUtility 的实现细节——
 * 与其去赌，不如在这边补成 []：两种行为下结果都一样，`foreach (var id in npc.stock)`
 * 不会炸。
 */
function normalizeForUnity(rows) {
  const optionalObjects = new Set();
  const arrays = new Set();

  for (const k of new Set(rows.flatMap(Object.keys))) {
    const has = rows.filter((r) => r[k] !== undefined && r[k] !== null);
    if (!has.length) continue;
    if (has.every((r) => Array.isArray(r[k]))) {
      arrays.add(k);
    } else if (has.every((r) => typeof r[k] === 'object') && has.length < rows.length) {
      optionalObjects.add(k);
    }
  }

  return rows.map((r) => {
    const out = {};
    for (const k of Object.keys(r)) {
      out[k] = optionalObjects.has(k) ? Object.assign({}, r[k], { present: true }) : r[k];
    }
    for (const k of arrays) {
      if (out[k] === undefined) out[k] = [];
    }
    return out;
  });
}

function mapForUnity(m) {
  const out = {};
  for (const k of Object.keys(m)) {
    if (k === 'lv') {
      out.lvMin = m.lv[0];
      out.lvMax = m.lv[1];
    } else if (k === 'decor') {
      out.decor = Object.keys(m.decor).map((kind) => ({ kind: kind, count: m.decor[kind] }));
    } else {
      out[k] = m[k];
    }
  }
  return out;
}

function configForUnity(ZX) {
  const cfg = {};
  for (const k of Object.keys(ZX.CONFIG)) cfg[k] = ZX.CONFIG[k];

  cfg.slots = ZX.SLOTS.map((s) => ({ key: s.key, name: s.name }));
  cfg.quality = Object.keys(ZX.QUALITY).map((key) => ({
    key: key,
    name: ZX.QUALITY[key].name,
    color: ZX.QUALITY[key].color,
    mul: ZX.QUALITY[key].mul,
  }));

  // 升级经验表：expToNext[level - 1] = 从 level 升到 level+1 要的经验。
  // 曲线是 stats.js 里的公式，直接把表拍出来，Unity 侧先不用翻公式。
  cfg.expToNext = [];
  for (let lv = 1; lv < ZX.CONFIG.MAX_LEVEL; lv++) cfg.expToNext.push(ZX.Stats.expToNext(lv));

  return cfg;
}

// ── 导出清单 ──────────────────────────────────────────────────

function collections(ZX) {
  return [
    { file: 'items.json', field: 'items', cls: 'ZxItem', rows: ZX.ITEMS.all },
    { file: 'monsters.json', field: 'monsters', cls: 'ZxMonster', rows: ZX.MONSTERS.all },
    { file: 'maps.json', field: 'maps', cls: 'ZxMap', rows: ZX.MAPS.all.map(mapForUnity) },
    { file: 'npcs.json', field: 'npcs', cls: 'ZxNpc', rows: ZX.NPCS.all },
    { file: 'quests.json', field: 'quests', cls: 'ZxQuest', rows: ZX.QUESTS.chain },
    { file: 'sects.json', field: 'sects', cls: 'ZxSect', rows: ZX.SECTS },
  ];
}

const HEADER = [
  '// 本文件由 tools/export-unity.mjs 生成，不要手改。',
  '// 数据源：src/data/*.js —— 改完数据跑 `npm run export:unity` 重新生成。',
  '',
].join('\n');

// ── 主流程 ────────────────────────────────────────────────────

const ZX = loadGameData();
const cols = collections(ZX).map((c) => Object.assign({}, c, { rows: normalizeForUnity(c.rows) }));
const config = configForUnity(ZX);

// 生成 C# 数据类（顺手当成一次数据体检：字段类型打架会在这里抛）
const specs = cols.map((c) => ({
  root: inferSchema(c.rows, c.cls),
  wrapper: { cls: c.cls + 'List', field: c.field },
}));
specs.push({ root: inferSchema([config], 'ZxConfig'), wrapper: null });
const dataCs = emitDataFile(specs, HEADER);

// 文件内容先在内存里备齐，再一次性落盘，中途抛错不会留下半套产物
const files = new Map();
for (const c of cols) {
  if (!c.rows.length) {
    console.error('✗ ' + c.file + ' 一条数据都没有，导出中止');
    process.exit(1);
  }
  files.set('Resources/ZhuxianData/' + c.file, JSON.stringify({ [c.field]: c.rows }, null, 2) + '\n');
}
files.set('Resources/ZhuxianData/config.json', JSON.stringify(config, null, 2) + '\n');
files.set('Runtime/ZxData.cs', dataCs);
files.set('Runtime/ZxDatabase.cs', fs.readFileSync(path.join(ROOT, 'tools', 'unity', 'ZxDatabase.cs'), 'utf8'));
files.set('Runtime/ZxSmokeTest.cs', fs.readFileSync(path.join(ROOT, 'tools', 'unity', 'ZxSmokeTest.cs'), 'utf8'));
files.set('README.md', readme(cols));

// 落盘前先把 JSON 再解析一遍，确认写出去的东西真能读回来
for (const [rel, text] of files) {
  if (!rel.endsWith('.json')) continue;
  try {
    JSON.parse(text);
  } catch (e) {
    console.error('✗ 生成的 ' + rel + ' 不是合法 JSON：' + e.message);
    process.exit(1);
  }
}

/** 已经落在 export/unity/ 下的文件（相对 OUT，统一用 / 分隔） */
function existingFiles(dir, base) {
  base = base || dir;
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...existingFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** 行尾归一化后再比。检出时被 git 转成 CRLF 不代表内容过期 */
function sameText(a, b) {
  return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
}

const orphans = existingFiles(OUT).filter((rel) => !files.has(rel));

if (CHECK_ONLY) {
  const stale = [...files.keys()].filter((rel) => {
    const f = path.join(OUT, rel);
    return !fs.existsSync(f) || !sameText(fs.readFileSync(f, 'utf8'), files.get(rel));
  });
  if (stale.length) {
    console.error(
      '✗ export/unity/ 与 src/data 不同步，过期文件：' + stale.join('，') + '\n' +
      '  跑一下：npm run export:unity'
    );
    process.exit(1);
  }
  if (orphans.length) {
    // 导出器只写自己那份清单，多出来的文件它不会清理，也不该假装没看见：
    // 删掉一个集合之后留下的旧 JSON 照样能被 ZxDatabase 读进去。
    console.error(
      '✗ export/unity/ 下有不该存在的文件：' + orphans.join('，') + '\n' +
      '  这些不在导出清单里，手动删掉'
    );
    process.exit(1);
  }
  console.log('✓ export/unity/ 与数据源一致（' + files.size + ' 个文件）');
  process.exit(0);
}

for (const [rel, text] of files) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}

const classCount = (dataCs.match(/public class /g) || []).length;
console.log('导出到 export/unity/');
for (const c of cols) console.log('  ' + c.file.padEnd(16) + c.rows.length + ' 条');
console.log('  config.json      ' + Object.keys(config).length + ' 项（含 ' + config.expToNext.length + ' 级经验表）');
console.log('  ZxData.cs        ' + classCount + ' 个类');
if (orphans.length) {
  console.log('\n⚠ 这些文件不在导出清单里，没动它们，确认后手动删：\n  ' + orphans.join('\n  '));
}

// ── 说明文档 ──────────────────────────────────────────────────

function readme(cols) {
  const rows = cols.map((c) => '| `' + c.file + '` | ' + c.rows.length + ' | `' + c.cls + '` |').join('\n');
  return `# 诛仙数据包（Unity）

由 \`tools/export-unity.mjs\` 从 [src/data](../../src/data) 生成，**不要手改这个目录**——
改数据请改 \`src/data/*.js\`，然后重跑 \`npm run export:unity\`。

## 装进工程

1. \`Runtime/\` 下的三个 .cs 拖到 \`Assets/\` 下任意位置（脚本放哪都行）
2. \`Resources/ZhuxianData/\` 整个拖到 \`Assets/Resources/\` 下
   （路径必须是 \`Assets/Resources/ZhuxianData/\`，\`ZxDatabase\` 按这个路径 Load）

## 用

\`\`\`csharp
using Zhuxian.Data;

var db = ZxDatabase.Load();

ZxItem sword   = db.Item("w_qingyunjian");
ZxMonster wolf = db.Monster("yegou");
ZxMap village  = db.Map("caomiao");
ZxSect qingyun = db.Sect("qingyun");

foreach (var npc in db.NpcsOnMap("caomiao")) Debug.Log(npc.name);

int expNeeded = db.ExpToNext(12);       // 12 级升 13 级要多少经验
float tile    = db.config.TILE;         // 地图坐标单位是「格」，乘它变像素
\`\`\`

## 先验一下通没通

把 \`ZxSmokeTest\` 挂到场景里任意一个 GameObject 上，按 Play。Console 会打出各表条数、
几个抽样查询、以及几个已知坑的验证结果——全绿就说明数据管道通了。不想按 Play 的话，
在 Inspector 里右键这个组件 →「跑一遍数据包冒烟测试」也行。

出错时它会把话说明白，比如目录没放对会直接告诉你该放哪儿。

## 内容

| 文件 | 条数 | C# 类 |
|---|---|---|
${rows}
| \`config.json\` | — | \`ZxConfig\` |

## 几处和 JS 侧不一样的地方

Unity 的 JsonUtility 不认字典，也不认顶层数组，所以导出时改了三处结构：

| JS 里 | JSON 里 |
|---|---|
| \`map.decor\` 是 \`{tree: 26, rock: 10}\` | \`[{"kind":"tree","count":26}, ...]\` |
| \`map.lv\` 是 \`[1, 5]\` | \`lvMin: 1\`, \`lvMax: 5\` |
| \`ZX.QUALITY\` 是按品质 key 索引的字典 | \`config.quality\` 数组，品质 key 进 \`key\` 字段 |

### 可选字段别拿 null 判断

JS 里判断一件装备有没有主动效果就是 \`if (item.active)\`，**这招在 Unity 失效**：
JsonUtility 不给可序列化类留 null，JSON 里没有的字段会变成一个字段全是 0 的实例。
所以可选的对象字段都带了一个 \`present\` 标记：

\`\`\`csharp
if (item.active.present) { /* 有主动效果 */ }   // ✅
if (item.active != null) { /* 永远成立 */ }     // ❌
\`\`\`

目前带 \`present\` 的有 \`item.stats\`、\`item.active\`、\`item.use\`、\`map.boss\`。
数组字段不用这个标记，但也不用担心：导出时已经把缺席的数组补成 \`[]\` 了
（比如 8 个不卖东西的 NPC 都有 \`"stock": []\`），所以 \`foreach\` 直接上，不会遇到 null。

另外几件值得知道的事：

- **怪物数值是终值**。\`exp\`/\`gold\`/\`atkMs\`/\`attackRange\`/\`isBoss\`/\`isElite\` 在 \`monsters.js\`
  加载时按 role 模板算好，这里导的是算完的结果，Unity 侧不用再翻公式。
- **坐标单位是格**，不是像素。渲染时乘 \`config.TILE\`（48）。怪物的 \`radius\`、
  技能的 \`range\`/\`radius\` 这些反过来，本来就是像素。
- **\`config.expToNext\` 是查表**，\`expToNext[lv-1]\` = 从 lv 升到 lv+1 要的经验，到满级
  （\`MAX_LEVEL\` = ${config.MAX_LEVEL}）为止。
- **数值是 int / double，不是 float**。字段类型照着当前数据推：现在恰好全是整数就生成
  \`int\`，以后调成小数会自动变 \`double\`——前提是你重跑了导出。
  用 double 而不是 Unity 更常见的 float，是因为这些数值的真身是 JS 里的双精度：
  存成 float 在写入那一刻就变了样（\`9.4f\` 实际是 9.400000095…），等级一乘、取整一落，
  算出来的气血就和网页版差 1。这不是洁癖，是 csharp/ 那边的对照测试真的因此红过。
- **可选的数字 / 布尔 / 字符串字段缺席时是 0 / false / null**，和 JS 里 \`undefined\` 的判断
  一模一样，直接翻就行：\`if (it.sect)\` → \`if (!string.IsNullOrEmpty(it.sect))\`，
  \`if (sk.burn)\` → \`if (sk.burn > 0)\`。技能的 \`dmg\`、任务 \`goal\` 的 \`monster\`/\`id\` 都属于这类，
  按 \`kind\` / \`type\` 分支就不会读到不该读的字段。

## 还没带过来的东西

这一步只搬数据。这些还在 JS 里，等逻辑层移植时再翻：

- 战斗公式（\`src/combat.js\`）、属性换算（\`src/stats.js\`）、掉落规则（\`ITEMS.rollGear\`）
- 技能行为（\`src/skills.js\` 按 \`kind\` 解释：bolt / pierce / blast / strike / nova / buff / heal）
- 任务状态机（\`src/quest.js\`）、背包堆叠（\`src/inventory.js\`）、刷怪与仇恨（\`src/world.js\`）
`;
}
