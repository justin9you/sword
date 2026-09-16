/**
 * 给 C# 移植版生成对照样本。
 *
 *   node tools/gen-fixtures.mjs
 *
 * 做法：把 src 下的逻辑模块塞进假 window 跑（跟 test-logic.mjs 同一套），
 * 但把 Math.random 换成确定性的 mulberry32——C# 那边实现同一个算法，
 * 于是同一串随机数喂给两边，输出必须一字不差。
 *
 * 为什么非得这么干：伤害、暴击、闪避都带随机，光比"公式看着一样"没用。
 * 真正会出事的是取整差一、系数写反、随机数消耗顺序不同（比如暴击没触发时
 * 该不该消耗一个随机数）——这些只有逐条对数才抓得到。实测抓到过两个：
 * 数据存成 float 导致气血差 1、C# 的 Math.Round 是银行家舍入。
 *
 * 这个文件只管「把 JS 跑起来 + 落盘」，具体有哪些样本在 fixture-cases.mjs。
 * 样本跟着仓库走，所以跑 C# 测试不需要装 Node，只有重新生成时才需要。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as cases from './fixture-cases.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'csharp', 'Zhuxian.Tests', 'fixtures');

/** 必须和 Zhuxian.Core/Rng.cs 里的 Mulberry32 完全一致 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 把逻辑模块跑起来，随机源换成可控的 ────────────────────────

const MODULES = [
  'src/config.js', 'src/util.js', 'src/stats.js',
  'src/data/sects.js', 'src/data/items.js', 'src/data/monsters.js',
  'src/data/maps.js', 'src/data/npcs.js', 'src/data/quests.js',
  'src/inventory.js', 'src/player.js', 'src/combat.js',
  'src/world.js', 'src/quest.js',
];

/** 当前生效的随机源。默认真随机，withRandom 期间换成种子随机 */
let currentRandom = Math.random;

function loadGame() {
  // 原型指向真正的 Math，这样 floor/pow 这些照常用，只换掉 random
  const patchedMath = Object.create(Math);
  patchedMath.random = () => currentRandom();

  const sandbox = { console, Math: patchedMath, Date, JSON, isFinite, parseInt, parseFloat };
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

/**
 * 在 fn 执行期间接管 Math.random，用给定种子出数，并记下用掉了哪些。
 * C# 那边用同一个种子重放，连消耗了几个都要对得上。
 */
function withRandom(seed, fn) {
  const roll = mulberry32(seed);
  const used = [];
  const prev = currentRandom;
  currentRandom = () => {
    const v = roll();
    used.push(v);
    return v;
  };
  try {
    return { value: fn(), used: used };
  } finally {
    currentRandom = prev;
  }
}

// ── 生成 ──────────────────────────────────────────────────────

const ctx = { ZX: loadGame(), mulberry32: mulberry32, withRandom: withRandom };

const FILES = {
  'rng.json': cases.buildRng(ctx),
  'exp.json': cases.buildExp(ctx),
  'derive.json': cases.buildDerive(ctx),
  'damage.json': cases.buildDamage(ctx),
  'buffs.json': cases.buildBuffs(ctx),
  'misc.json': cases.buildMisc(ctx),
  'inventory.json': cases.buildInventory(ctx),
  'player.json': cases.buildPlayer(ctx),
  'quest.json': cases.buildQuest(ctx),
  'world.json': cases.buildWorld(ctx),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, data] of Object.entries(FILES)) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + '\n');
}

console.log('对照样本写到 csharp/Zhuxian.Tests/fixtures/');
for (const [name, data] of Object.entries(FILES)) {
  console.log('  ' + name.padEnd(16) + countCases(data) + ' 条');
}

/** 数一下这份样本里有多少条，纯粹为了打印时看着有数 */
function countCases(data) {
  if (Array.isArray(data.cases)) return data.cases.length;
  if (Array.isArray(data.values)) return data.values.length;
  let n = 0;
  for (const v of Object.values(data)) if (Array.isArray(v)) n += v.length;
  return n;
}
