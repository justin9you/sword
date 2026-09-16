/**
 * 把游戏数据导成 Unity 能直接吃的 JSON + C# 数据类。
 *
 *   node tools/export-gamedata.mjs          导出到 export/ 和 godot/data/
 *   node tools/export-gamedata.mjs --check  只校验，不写文件（给 npm run test:data 用）
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
import { inferSchema, emitDataFile } from './csharp-codegen.mjs';
import { rootReadme, unityReadme, godotReadme } from './export-docs.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/**
 * 导出器全权拥有的目录：里面每一个文件都由它生成，多出来的都算孤儿。
 * godot/data/zhuxian 是 Godot 工程里的数据副本——Godot 只认 res:// 底下的文件，
 * 所以那份必须真实存在，但也不能靠人手动拷，只能一起生成、一起检查。
 */
const OWNED_DIRS = ['export', 'godot/data/zhuxian', 'godot/scripts'];
const CHECK_ONLY = process.argv.includes('--check');

/** Godot 工程里那份数据的位置，和 ZxGodotData.DataDir 对应 */
const GODOT_DATA = 'godot/data/zhuxian/';

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
  '// 本文件由 tools/export-gamedata.mjs 生成，不要手改。',
  '// 数据源：src/data/*.js —— 改完数据跑 `npm run export:data` 重新生成。',
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
  const json = JSON.stringify({ [c.field]: c.rows }, null, 2) + '\n';
  files.set('export/data/' + c.file, json);
  files.set(GODOT_DATA + c.file, json);
}
const configJson = JSON.stringify(config, null, 2) + '\n';
files.set('export/data/config.json', configJson);
files.set(GODOT_DATA + 'config.json', configJson);

// 数据类是引擎无关的（只 using System），所以和 JSON 放一起
files.set('export/data/ZxData.cs', dataCs);

// 每个引擎一个适配器目录，只放"这个引擎怎么把文件读进来"
const adapter = (engine, file) => fs.readFileSync(path.join(ROOT, 'tools', engine, file), 'utf8');
files.set('export/unity/ZxDatabase.cs', adapter('unity', 'ZxDatabase.cs'));
files.set('export/unity/ZxSmokeTest.cs', adapter('unity', 'ZxSmokeTest.cs'));
files.set('export/godot/ZxGodotData.cs', adapter('godot', 'ZxGodotData.cs'));
files.set('export/godot/ZxSmoke.cs', adapter('godot', 'ZxSmoke.cs'));

// Godot 工程里也要有一份：挂在节点上的 C# 脚本必须落在 res:// 底下，
// 编译时从别处 include 进来是不够的，编辑器认不出它是个脚本
files.set('godot/scripts/ZxGodotData.cs', adapter('godot', 'ZxGodotData.cs'));
files.set('godot/scripts/ZxSmoke.cs', adapter('godot', 'ZxSmoke.cs'));

files.set('export/README.md', rootReadme(cols, config));
files.set('export/unity/README.md', unityReadme(config));
files.set('export/godot/README.md', godotReadme(config));

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

/** 某个目录下已经存在的文件，路径相对仓库根，统一用 / 分隔 */
function existingFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    const rel = dir + '/' + name;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) out.push(...existingFiles(rel));
    else out.push(rel);
  }
  return out;
}

/** 行尾归一化后再比。检出时被 git 转成 CRLF 不代表内容过期 */
function sameText(a, b) {
  return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
}

/**
 * 引擎自己在这些目录里生成的边车文件，不算孤儿。
 * Godot 4.4+ 会给每个脚本生成 .uid，用来稳定资源引用——它该进版本库，
 * 只是不归导出器管。
 */
const ENGINE_SIDECARS = /.uid$/;

const orphans = OWNED_DIRS.flatMap(existingFiles)
  .filter((rel) => !files.has(rel) && !ENGINE_SIDECARS.test(rel));

if (CHECK_ONLY) {
  const stale = [...files.keys()].filter((rel) => {
    const f = path.join(ROOT, rel);
    return !fs.existsSync(f) || !sameText(fs.readFileSync(f, 'utf8'), files.get(rel));
  });
  if (stale.length) {
    console.error(
      '✗ 导出的文件与 src/data 不同步，过期的有：' + stale.join('，') + '\n' +
      '  跑一下：npm run export:data'
    );
    process.exit(1);
  }
  if (orphans.length) {
    // 导出器只写自己那份清单，多出来的文件它不会清理，也不该假装没看见：
    // 删掉一个集合之后留下的旧 JSON 照样能被 ZxDatabase 读进去。
    console.error(
      '✗ 导出目录下有不该存在的文件：' + orphans.join('，') + '\n' +
      '  这些不在导出清单里，手动删掉'
    );
    process.exit(1);
  }
  console.log('✓ 导出的文件与数据源一致（' + files.size + ' 个文件）');
  process.exit(0);
}

for (const [rel, text] of files) {
  const f = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}

const classCount = (dataCs.match(/public class /g) || []).length;
console.log('导出到 export/ 和 ' + GODOT_DATA);
for (const c of cols) console.log('  ' + c.file.padEnd(16) + c.rows.length + ' 条');
console.log('  config.json      ' + Object.keys(config).length + ' 项（含 ' + config.expToNext.length + ' 级经验表）');
console.log('  ZxData.cs        ' + classCount + ' 个类');
if (orphans.length) {
  console.log('\n⚠ 这些文件不在导出清单里，没动它们，确认后手动删：\n  ' + orphans.join('\n  '));
}
