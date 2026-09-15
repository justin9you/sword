/**
 * 纯逻辑自测。不开浏览器，把 src 下的模块塞进一个假的 window 里跑。
 *
 *   node tools/test-logic.mjs
 *
 * 覆盖两类问题：
 *   1. 规则错了——等级曲线、伤害公式、背包堆叠、存档往返
 *   2. 数据接线断了——地图里刷的怪不存在、任务指向的 NPC 不存在、
 *      商店卖的物品 id 拼错、sw.js 的缓存清单漏文件
 * 第二类最容易在加内容时悄悄发生，而且一发生就是运行时崩溃。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── 断言 ──────────────────────────────────────────────────────
let passed = 0;
const failures = [];

function ok(cond, name, detail) {
  if (cond) {
    passed++;
    return;
  }
  failures.push(name + (detail ? '\n      ' + detail : ''));
}

function eq(actual, expected, name) {
  ok(actual === expected, name, '期望 ' + expected + '，实得 ' + actual);
}

function near(actual, expected, tol, name) {
  ok(Math.abs(actual - expected) <= tol, name, '期望 ≈' + expected + '，实得 ' + actual);
}

function group(title, fn) {
  console.log('\n  ' + title);
  const before = failures.length;
  fn();
  const bad = failures.length - before;
  console.log('    ' + (bad ? '✗ ' + bad + ' 项不通过' : '✓ 全部通过'));
}

// ── 造一个假 window，把模块装进去 ─────────────────────────────
const store = new Map();

const sandbox = {
  console,
  performance: { now: () => Date.now() },
  setTimeout,
  clearTimeout,
  Math,
  Date,
  JSON,
  isFinite,
  parseInt,
  parseFloat,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  // 下面这些只是让模块能加载，测试里不会真调
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {} }),
  },
  addEventListener: () => {},
  requestAnimationFrame: () => 0,
  devicePixelRatio: 1,
  innerWidth: 1280,
  innerHeight: 720,
  navigator: { serviceWorker: null },
  location: { protocol: 'http:' },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

/** main.js 不加载：它一进来就开始跑游戏循环 */
const MODULES = [
  'src/config.js', 'src/util.js', 'src/stats.js',
  'src/data/sects.js', 'src/data/items.js', 'src/data/monsters.js',
  'src/data/maps.js', 'src/data/npcs.js', 'src/data/quests.js',
  'src/inventory.js', 'src/player.js', 'src/combat.js', 'src/world.js',
  'src/skills.js', 'src/quest.js', 'src/save.js', 'src/audio.js',
  'src/art.js', 'src/art-actors.js', 'src/render.js', 'src/input.js',
  'src/ui.js', 'src/ui-panels.js',
];

for (const rel of MODULES) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: rel });
  } catch (e) {
    console.error('\n✗ 模块加载失败：' + rel + '\n  ' + e.message + '\n');
    process.exit(1);
  }
}

const ZX = sandbox.ZX;

// ── 数据接线 ──────────────────────────────────────────────────
group('数据接线', () => {
  const badSpawn = [];
  const badBoss = [];
  const badNpc = [];
  const badPortal = [];

  for (const m of ZX.MAPS.all) {
    for (const s of m.spawns || []) {
      if (!ZX.MONSTERS.byId(s.id)) badSpawn.push(m.key + ' → ' + s.id);
    }
    if (m.boss && !ZX.MONSTERS.byId(m.boss.id)) badBoss.push(m.key + ' → ' + m.boss.id);
    for (const n of m.npcs || []) {
      if (!ZX.NPCS.byKey(n)) badNpc.push(m.key + ' → ' + n);
    }
    for (const p of m.portals || []) {
      if (!ZX.MAPS.all.some((x) => x.key === p.to)) badPortal.push(m.key + ' → ' + p.to);
    }
  }

  ok(!badSpawn.length, '刷怪表里的怪物都存在', badSpawn.join('，'));
  ok(!badBoss.length, '每张图的首领都存在', badBoss.join('，'));
  ok(!badNpc.length, '地图上列的 NPC 都存在', badNpc.join('，'));
  ok(!badPortal.length, '传送门指向的地图都存在', badPortal.join('，'));

  // NPC 声明的 map 要和地图上列的对得上，否则任务面板会指错路
  const mismatch = [];
  for (const n of ZX.NPCS.all) {
    const m = ZX.MAPS.byKey(n.map);
    if (!m.npcs || m.npcs.indexOf(n.key) < 0) mismatch.push(n.key + ' 自称在 ' + n.map);
  }
  ok(!mismatch.length, 'NPC 的所在地图与地图声明一致', mismatch.join('，'));

  // 商店货单
  const badStock = [];
  for (const n of ZX.NPCS.all) {
    for (const id of n.stock || []) {
      if (!ZX.ITEMS.byId(id)) badStock.push(n.key + ' → ' + id);
    }
  }
  ok(!badStock.length, '商店货单里的物品都存在', badStock.join('，'));

  // 任务
  const badQuest = [];
  for (const q of ZX.QUESTS.chain) {
    if (!ZX.NPCS.byKey(q.giver)) badQuest.push(q.key + ' 发布人 ' + q.giver);
    if (!ZX.NPCS.byKey(q.turnIn)) badQuest.push(q.key + ' 交付人 ' + q.turnIn);
    if (q.goal.type === 'kill' && !ZX.MONSTERS.byId(q.goal.monster)) {
      badQuest.push(q.key + ' 目标怪 ' + q.goal.monster);
    }
    if (q.goal.type === 'boss' && !ZX.MONSTERS.byId(q.goal.id)) {
      badQuest.push(q.key + ' 目标首领 ' + q.goal.id);
    }
    for (const it of q.reward.items || []) {
      if (!ZX.ITEMS.byId(it)) badQuest.push(q.key + ' 奖励物品 ' + it);
    }
  }
  ok(!badQuest.length, '任务链的发布人/目标/奖励都存在', badQuest.join('，'));

  // 任务目标怪必须真的刷在某张图上，否则任务做不完
  const unreachable = [];
  for (const q of ZX.QUESTS.chain) {
    const id = q.goal.type === 'kill' ? q.goal.monster : q.goal.type === 'boss' ? q.goal.id : null;
    if (!id) continue;
    const found = ZX.MAPS.all.some(
      (m) => (m.spawns || []).some((s) => s.id === id) || (m.boss && m.boss.id === id)
    );
    if (!found) unreachable.push(q.key + ' → ' + id);
  }
  ok(!unreachable.length, '任务目标怪都能在某张图刷出来', unreachable.join('，'));

  // 物品 id 不能重复
  const seen = new Set();
  const dup = [];
  for (const it of ZX.ITEMS.all) {
    if (seen.has(it.id)) dup.push(it.id);
    seen.add(it.id);
  }
  ok(!dup.length, '物品 id 无重复', dup.join('，'));

  // 门派专属装备要覆盖到每个门派，否则有人一辈子没专属兵器
  for (const s of ZX.SECTS) {
    const n = ZX.ITEMS.all.filter((i) => i.sect === s.key).length;
    ok(n >= 3, s.name + ' 有至少 3 件专属装备', '实得 ' + n);
  }

  // 出生点不能压在障碍里
  const stuck = [];
  for (const m of ZX.MAPS.all) {
    const T = ZX.CONFIG.TILE;
    const x = m.start.x * T + T / 2;
    const y = m.start.y * T + T / 2;
    for (const b of m.blocks) {
      if (x > b.x * T && x < (b.x + b.w) * T && y > b.y * T && y < (b.y + b.h) * T) {
        stuck.push(m.key);
      }
    }
    ok(m.start.x < m.w && m.start.y < m.h, m.key + ' 出生点在地图范围内');
  }
  ok(!stuck.length, '出生点没有压在障碍上', stuck.join('，'));
});

// ── 等级与属性 ────────────────────────────────────────────────
group('等级与属性', () => {
  const p = ZX.Player.create('测试', 'qingyun');
  eq(p.level, 1, '新号 1 级');
  ok(p.stats.hp > 0 && p.stats.mp > 0, '新号有气血和灵力');
  eq(p.hp, p.stats.hp, '新号满血');

  // 曲线必须单调递增，否则后期会出现"升级反而更快"
  let mono = true;
  for (let lv = 1; lv < ZX.CONFIG.MAX_LEVEL - 1; lv++) {
    if (ZX.Stats.expToNext(lv + 1) <= ZX.Stats.expToNext(lv)) mono = false;
  }
  ok(mono, '升级所需经验逐级递增');
  eq(ZX.Stats.expToNext(ZX.CONFIG.MAX_LEVEL), Infinity, '满级不再需要经验');

  // 一口气灌足够的经验，应该连升多级且属性跟着涨
  const before = p.stats.atk;
  const levels = ZX.Player.gainExp(p, 200000);
  ok(levels > 1, '大额经验可连升多级', '升了 ' + levels + ' 级');
  ok(p.stats.atk > before, '升级后攻击提高');
  eq(p.points, levels * ZX.CONFIG.POINTS_PER_LEVEL, '每级给够属性点');
  eq(p.hp, p.stats.hp, '升级回满气血');

  // 加点
  const con = p.base.con;
  const hp = p.stats.hp;
  ok(ZX.Player.spendPoint(p, 'con'), '能加点');
  eq(p.base.con, con + 1, '加点生效');
  ok(p.stats.hp > hp, '体质加点提高气血上限');
  ok(!ZX.Player.spendPoint(p, 'nope'), '非法属性名加不了点');

  // 满级之后不该再涨
  const maxed = ZX.Player.create('满级', 'fenxiang');
  maxed.level = ZX.CONFIG.MAX_LEVEL;
  ZX.Player.recompute(maxed);
  eq(ZX.Player.gainExp(maxed, 999999999), 0, '满级不再升级');

  // 门派差异要真的存在，不能四个门派一个模子
  const qy = ZX.Player.create('a', 'qingyun');
  const ty = ZX.Player.create('b', 'tianyin');
  const fx = ZX.Player.create('c', 'fenxiang');
  ok(ty.stats.hp > fx.stats.hp, '天音寺比焚香谷血厚');
  ok(fx.stats.mag > qy.stats.mag, '焚香谷法力高于青云门');
});

// ── 背包 ──────────────────────────────────────────────────────
group('背包与装备', () => {
  const Inv = ZX.Inventory;
  let bag = Inv.emptyBag();
  eq(bag.length, ZX.CONFIG.BAG_SIZE, '背包格子数正确');

  // 堆叠
  let r = Inv.add(bag, 'c_xiaohuan', 5);
  bag = r.bag;
  eq(r.added, 5, '放进 5 颗小还丹');
  eq(Inv.count(bag, 'c_xiaohuan'), 5, '数量对得上');
  bag = Inv.add(bag, 'c_xiaohuan', 3).bag;
  eq(Inv.count(bag, 'c_xiaohuan'), 8, '同种丹药堆在一起');
  eq(bag.filter((s) => s).length, 1, '8 颗只占一格');

  // 超过堆叠上限要开新格
  let big = Inv.emptyBag();
  big = Inv.add(big, 'c_xiaohuan', ZX.CONFIG.STACK_MAX + 5).bag;
  eq(big.filter((s) => s).length, 2, '超过上限自动开新格');

  // 装备不堆叠
  let gear = Inv.emptyBag();
  gear = Inv.add(gear, 'w_chaidao', 3).bag;
  eq(gear.filter((s) => s).length, 3, '装备一件一格');

  // 背包满了要如实返回
  let full = Inv.emptyBag();
  for (let i = 0; i < ZX.CONFIG.BAG_SIZE; i++) full = Inv.add(full, 'w_chaidao', 1).bag;
  ok(Inv.isFull(full), '塞满后 isFull 为真');
  eq(Inv.add(full, 'w_chaidao', 1).added, 0, '满了就放不进去');

  // 原地不可变：add 必须返回新数组
  const orig = Inv.emptyBag();
  const after = Inv.add(orig, 'c_xiaohuan', 1).bag;
  ok(orig !== after, 'add 返回新数组');
  eq(orig.filter((s) => s).length, 0, '原数组没被改');

  // 穿装备
  const p = ZX.Player.create('测试', 'qingyun');
  p.level = 40;
  ZX.Player.recompute(p);
  p.bag = Inv.add(Inv.emptyBag(), 'w_tianya', 1).bag;
  const eqRes = Inv.equip(p.bag, p.equip, 0, p.sect, p.level);
  ok(eqRes, '够等级够门派能穿上天琊');
  eq(eqRes.equip.weapon, 'w_tianya', '天琊进了兵器槽');
  eq(eqRes.bag[0].id, 'w_shaohuo', '换下来的烧火棍退回原格');

  // 门派限制
  const gw = ZX.Player.create('魔', 'guiwang');
  gw.level = 40;
  gw.bag = Inv.add(Inv.emptyBag(), 'w_tianya', 1).bag;
  ok(!Inv.equip(gw.bag, gw.equip, 0, gw.sect, gw.level), '鬼王宗穿不了青云专属');

  // 等级限制
  const low = ZX.Player.create('新', 'qingyun');
  low.bag = Inv.add(Inv.emptyBag(), 'w_zhuxian', 1).bag;
  ok(!Inv.equip(low.bag, low.equip, 0, low.sect, low.level), '1 级穿不了诛仙古剑');

  // 装备属性要真的加到身上
  const p2 = ZX.Player.create('测试2', 'qingyun');
  const atk0 = p2.stats.atk;
  p2.equip.weapon = 'w_xuantie';
  p2.level = 20;
  ZX.Player.recompute(p2);
  ok(p2.stats.atk > atk0 + 50, '玄铁重剑的攻击加成生效');

  // 脱装备不能把人脱死
  const p3 = ZX.Player.create('测试3', 'tianyin');
  p3.level = 30;
  p3.equip.robe = 'a_jiasha';
  ZX.Player.recompute(p3);
  p3.hp = 1;
  p3.equip.robe = null;
  ZX.Player.recompute(p3);
  ok(p3.hp >= 1, '脱下加血装备后气血不会归零');
});

// ── 战斗 ──────────────────────────────────────────────────────
group('战斗数值', () => {
  const C = ZX.Combat;

  // 高防也得掉血，不能完全免疫
  const tanked = C.damage(10, 100000, 'phys', 1, {});
  ok(tanked.amount >= ZX.CONFIG.MIN_DAMAGE, '再高的防御也有最低伤害');

  // 攻击越高伤害越高（取多次平均，避开随机浮动）
  const avg = (atk) => {
    let s = 0;
    for (let i = 0; i < 400; i++) s += C.damage(atk, 20, 'phys', 1, {}).amount;
    return s / 400;
  };
  ok(avg(200) > avg(100), '攻击越高伤害越高');

  // 等级压制：高打低加伤，低打高减伤
  const gapUp = (() => {
    let s = 0;
    for (let i = 0; i < 400; i++) s += C.damage(200, 20, 'phys', 1, { levelGap: 10 }).amount;
    return s / 400;
  })();
  const gapDown = (() => {
    let s = 0;
    for (let i = 0; i < 400; i++) s += C.damage(200, 20, 'phys', 1, { levelGap: -10 }).amount;
    return s / 400;
  })();
  ok(gapUp > gapDown, '等级压制生效');

  // 压制要有上限，不能越级无限放大
  const huge = (() => {
    let s = 0;
    for (let i = 0; i < 200; i++) s += C.damage(200, 20, 'phys', 1, { levelGap: 999 }).amount;
    return s / 200;
  })();
  ok(huge < gapUp * 2.2, '等级压制有封顶');

  // 必暴一定暴
  eq(C.damage(100, 0, 'phys', 1, { critRate: 1 }).crit, true, '暴击率 100% 必定暴击');
  eq(C.damage(100, 0, 'phys', 1, { critRate: 0 }).crit, false, '暴击率 0 不会暴击');

  // 护盾先吃伤害
  const t = { buffs: [] };
  C.addBuff(t, { kind: 'shield', ms: 5000, value: 100 });
  eq(C.absorb(t, 60), 0, '护盾够用时不掉血');
  eq(C.absorb(t, 60), 20, '护盾用完后溢出的伤害照打');

  // 同名 buff 刷新而不是叠加
  const t2 = { buffs: [] };
  C.addBuff(t2, { kind: 'atkUp', ms: 1000, amount: 0.2 });
  C.addBuff(t2, { kind: 'atkUp', ms: 5000, amount: 0.35 });
  eq(t2.buffs.length, 1, '同名 buff 只留一个');
  eq(t2.buffs[0].amount, 0.35, '刷新时取更强的那个');
  eq(t2.buffs[0].ms, 5000, '刷新时取更久的那个');

  // 到期要清掉
  const t3 = { buffs: [] };
  C.addBuff(t3, { kind: 'slow', ms: 500, amount: 0.5 });
  C.tickBuffs(t3, 600);
  eq(t3.buffs.length, 0, 'buff 到期自动清除');

  // 持续伤害按秒结算
  const t4 = { buffs: [] };
  C.addBuff(t4, { kind: 'burn', ms: 3000, dps: 100 });
  let total = 0;
  for (let i = 0; i < 30; i++) total += C.tickBuffs(t4, 100);
  near(total, 300, 12, '灼烧 3 秒共约 300 点伤害');

  // 定身期间不能动
  const t5 = { buffs: [] };
  C.addBuff(t5, { kind: 'stun', ms: 1000 });
  ok(C.disabled(t5), '定身状态判定为不能行动');
});

// ── 世界 ──────────────────────────────────────────────────────
group('世界与碰撞', () => {
  const W = ZX.World;
  const world = W.create('dazhu');
  ok(world.monsters.length > 0, '进图就有怪');
  ok(world.monsters.some((m) => m.isBoss), '首领已就位');

  // 怪不能生在墙里
  const inWall = world.monsters.filter((m) => W.blocked(world, m.x, m.y, m.def.radius));
  eq(inWall.length, 0, '刷出来的怪没有卡在障碍里');

  // 边界
  ok(W.blocked(world, -10, 100, 12), '地图外算障碍');
  ok(W.blocked(world, world.w + 10, 100, 12), '右边界外算障碍');

  // 滑墙：贴着墙斜走不该完全卡死
  const b = world.blocks[0];
  const px = b.x - 14;
  const py = b.y + b.h / 2;
  const moved = W.move(world, px, py, 20, 20, 12);
  ok(moved.y !== py, '撞墙时仍能沿另一个轴滑动');

  // 上限
  ok(world.monsters.filter((m) => !m.isBoss).length <= ZX.CONFIG.MAX_ALIVE, '存活数不超上限');

  // 安全区不刷怪
  const town = W.create('heyang');
  eq(town.monsters.length, 0, '河阳城没有怪');
  ok(town.npcs.length > 0, '河阳城有 NPC');

  // 掉落表能跑通且掉的东西都是真物品
  const p = ZX.Player.create('测试', 'qingyun');
  p.level = 20;
  ZX.Player.recompute(p);
  const w2 = W.create('dixue');
  const boss = w2.monsters.find((m) => m.isBoss);
  const loot = W.rollLoot(w2, boss, p);
  ok(loot.length > 0, '首领必掉东西');
  ok(loot.every((it) => ZX.ITEMS.byId(it.id)), '掉落的都是有效物品');
});

// ── 任务 ──────────────────────────────────────────────────────
group('任务链', () => {
  const p = ZX.Player.create('测试', 'qingyun');
  const q = ZX.Quest.current(p);
  eq(q.key, 'q1', '新号从第一条任务开始');
  ok(!ZX.Quest.complete(p), '刚接的任务未完成');

  // 杀对了才算
  const wrong = ZX.MONSTERS.byId('shanzhu');
  const right = ZX.MONSTERS.byId('yegou');
  ZX.Quest.onKill(p, wrong);
  eq(p.quest.progress, 0, '杀错怪不计数');
  for (let i = 0; i < q.goal.count; i++) ZX.Quest.onKill(p, right);
  eq(p.quest.progress, q.goal.count, '杀够了计数到位');
  ok(ZX.Quest.complete(p), '目标达成即可复命');

  // 超杀不溢出
  ZX.Quest.onKill(p, right);
  eq(p.quest.progress, q.goal.count, '多杀不会超过目标数');

  // 交任务
  ok(!ZX.Quest.canTurnInAt(p, 'puzhi'), '不能找错人复命');
  ok(ZX.Quest.canTurnInAt(p, q.turnIn), '找对人可以复命');
  const gold0 = p.gold;
  const res = ZX.Quest.turnIn(p, q.turnIn);
  ok(res, '复命成功');
  eq(p.gold, gold0 + q.reward.gold, '灵石到账');
  eq(p.quest.current, 'q2', '自动接下一条');
  eq(p.quest.progress, 0, '进度归零');
  ok(p.quest.done.q1, '已完成的记在册');

  // 等级不够时任务不推进
  const low = ZX.Player.create('新', 'qingyun');
  low.quest.current = 'q7';   // 要 15 级
  low.level = 1;
  ZX.Quest.onKill(low, ZX.MONSTERS.byId('xuanshe_wang'));
  eq(low.quest.progress, 0, '等级不够时不推进任务');

  // 整条链能走到底
  const runner = ZX.Player.create('通关', 'qingyun');
  let steps = 0;
  while (runner.quest.current && steps < 100) {
    const cur = ZX.Quest.current(runner);
    runner.level = Math.max(runner.level, cur.lv);
    ZX.Player.recompute(runner);
    runner.quest.progress = cur.goal.type === 'kill' ? cur.goal.count : 1;
    const r = ZX.Quest.turnIn(runner, cur.turnIn);
    ok(!!r, '任务 ' + cur.key + ' 可以交付');
    steps++;
  }
  eq(steps, ZX.QUESTS.chain.length, '整条主线可以从头走到尾');
  eq(runner.quest.current, null, '走完后没有下一条');
});

// ── 存档 ──────────────────────────────────────────────────────
group('存档往返', () => {
  const p = ZX.Player.create('存档测试', 'fenxiang');
  p.level = 25;
  p.gold = 7777;
  p.points = 4;
  p.base.spi = 30;
  p.map = 'siling';
  p.visited.siling = true;
  p.quest.current = 'q9';
  p.quest.progress = 3;
  p.quest.done = { q1: true, q2: true };
  p.kills = 321;
  p.bag = ZX.Inventory.add(ZX.Inventory.emptyBag(), 'c_dahuan', 7).bag;
  p.equip.weapon = 'w_yuqing';
  ZX.Player.recompute(p);

  ok(ZX.Save.save(p), '存档写入成功');
  const q = ZX.Save.load();
  ok(q, '存档读得回来');
  eq(q.name, '存档测试', '名字还在');
  eq(q.sect, 'fenxiang', '门派还在');
  eq(q.level, 25, '等级还在');
  eq(q.gold, 7777, '灵石还在');
  eq(q.base.spi, 30, '加点还在');
  eq(q.map, 'siling', '所在地图还在');
  eq(q.quest.current, 'q9', '任务进度还在');
  eq(q.quest.progress, 3, '任务计数还在');
  eq(q.kills, 321, '击杀数还在');
  eq(ZX.Inventory.count(q.bag, 'c_dahuan'), 7, '背包内容还在');
  eq(q.equip.weapon, 'w_yuqing', '装备还在');
  eq(q.stats.mag, p.stats.mag, '属性重算结果一致');

  // 坏存档不能把游戏搞崩
  store.set('zx.save.v1', '{ 这不是 json');
  ZX.Save.wipe();
  store.set('zx.save.v1', '{"这不是":"存档"}');
  eq(ZX.Save.load(), null, '残缺存档读出 null 而不是抛异常');

  // 未知物品 id 要被丢掉，不能让改过数值表的老存档崩掉
  ZX.Save.wipe();
  const p2 = ZX.Player.create('兼容', 'qingyun');
  ZX.Save.save(p2);
  const raw = JSON.parse(store.get('zx.save.v1'));
  raw.bag[0] = { id: 'w_不存在的剑', n: 1 };
  raw.equip.weapon = 'w_也不存在';
  store.set('zx.save.v1', JSON.stringify(raw));
  const p3 = ZX.Save.load();
  ok(p3, '含未知物品的存档仍能读出');
  eq(p3.equip.weapon, null, '未知装备被丢弃');
  ok(p3.bag.every((s) => !s || ZX.ITEMS.byId(s.id)), '背包里没有未知物品');

  ZX.Save.wipe();
  eq(ZX.Save.hasSave(), false, '清档之后没有存档');
});

// ── sw.js 缓存清单 ────────────────────────────────────────────
group('离线缓存清单', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = [];
  for (const block of ['CORE', 'OPTIONAL']) {
    const m = sw.match(new RegExp('const ' + block + '\\s*=\\s*\\[([\\s\\S]*?)\\]', 'm'));
    if (!m) continue;
    for (const q of m[1].matchAll(/'([^']+)'/g)) listed.push(q[1]);
  }

  const missing = listed.filter((r) => r !== './' && !fs.existsSync(path.join(ROOT, r.replace(/^\.\//, ''))));
  ok(!missing.length, 'sw.js 列的文件都存在', missing.join('，'));

  // index.html 里引的每个脚本都得在缓存清单里，否则离线打开会缺模块
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const notCached = scripts.filter((s) => listed.indexOf(s) < 0);
  ok(!notCached.length, 'index.html 引用的脚本都在缓存清单里', notCached.join('，'));
  eq(scripts.length, MODULES.length + 1, 'index.html 的脚本数与测试加载的模块数一致（含 main.js）');
});

// ── 汇总 ──────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(52));
if (failures.length) {
  console.log('  ✗ ' + failures.length + ' 项不通过（' + passed + ' 项通过）\n');
  for (const f of failures) console.log('    · ' + f);
  console.log('');
  process.exit(1);
}
console.log('  ✓ 全部 ' + passed + ' 项通过');
console.log('─'.repeat(52) + '\n');
