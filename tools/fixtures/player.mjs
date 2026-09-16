/**
 * 对照样本的内容定义。由 tools/gen-fixtures.mjs 调用。
 *
 * 每个 build* 函数拿到一个上下文：
 *   ZX          跑起来的 JS 游戏模块
 *   mulberry32  确定性随机，和 C# 侧 Zhuxian.Core/Rng.cs 是同一个算法
 *   withRandom  在一段代码里接管 Math.random，并记下这段用掉了哪些随机数
 *
 * 挑样本的原则：挑那些「翻错了但看着还挺对」的地方——取整方向、边界条件、
 * 随机数消耗顺序、以及"背包满了会怎样"这类分支。纯直给的公式反而不用堆太多条。
 */

// 背包与玩家。对应 src/inventory.js 和 src/player.js。

import { snapshotBag, snapshotEquip, snapshotStats, snapshotPlayer } from './snapshots.mjs';
/**
 * 背包操作。这里的每一条都是"翻译时容易写歪"的分支：
 * 堆叠上限、跨格扣除、不够扣时整个不动、背包满了塞不下、
 * 穿装备时旧装备正好回到刚空出来的那一格。
 */
export function buildInventory({ ZX }) {
  const cases = [];
  const CFG = ZX.CONFIG;

  const record = (name, bag, extra) =>
    cases.push(Object.assign({ name: name, bag: snapshotBag(bag) }, extra || {}));

  // 堆叠：99 上限，超了要开新格
  {
    let bag = ZX.Inventory.emptyBag();
    const r1 = ZX.Inventory.add(bag, 'c_xiaohuan', 250);
    record('堆叠超过上限要开新格', r1.bag, { added: r1.added });
  }

  // 往已有的半堆里加：先把半堆填满，多的才开新格。
  // 从空背包开始加的话根本走不到堆叠分支，等于没测
  {
    let bag = ZX.Inventory.emptyBag();
    bag = ZX.Inventory.add(bag, 'c_xiaohuan', 50).bag;
    const r = ZX.Inventory.add(bag, 'c_xiaohuan', 60);
    record('往已有的半堆里加', r.bag, { added: r.added, count: ZX.Inventory.count(r.bag, 'c_xiaohuan') });
  }

  // 几个半堆散在不同格子，要按顺序一个个填满
  {
    let bag = ZX.Inventory.emptyBag();
    bag = ZX.Inventory.add(bag, 'c_xiaohuan', 250).bag;   // 99 / 99 / 52
    bag = ZX.Inventory.removeAt(bag, 0, 60);              // 39 / 99 / 52
    const r = ZX.Inventory.add(bag, 'c_xiaohuan', 100);
    record('多个半堆按顺序填满', r.bag, { added: r.added, count: ZX.Inventory.count(r.bag, 'c_xiaohuan') });
  }

  // 不可堆叠的东西一格一个
  {
    let bag = ZX.Inventory.emptyBag();
    const r = ZX.Inventory.add(bag, 'w_chaidao', 3);
    record('装备不堆叠，一格一件', r.bag, { added: r.added });
  }

  // 背包塞满：added 必须小于请求数
  {
    let bag = ZX.Inventory.emptyBag();
    const r = ZX.Inventory.add(bag, 'w_chaidao', CFG.BAG_SIZE + 10);
    record('背包满了 added 要小于请求数', r.bag, { added: r.added, full: ZX.Inventory.isFull(r.bag) });
  }

  // 按 id 跨格扣除
  {
    let bag = ZX.Inventory.emptyBag();
    bag = ZX.Inventory.add(bag, 'c_xiaohuan', 150).bag;
    const after = ZX.Inventory.removeById(bag, 'c_xiaohuan', 120);
    record('跨格扣除', after, { count: ZX.Inventory.count(after, 'c_xiaohuan') });
  }

  // 不够扣就整个不动，返回 null
  {
    let bag = ZX.Inventory.emptyBag();
    bag = ZX.Inventory.add(bag, 'c_xiaohuan', 5).bag;
    const after = ZX.Inventory.removeById(bag, 'c_xiaohuan', 9);
    cases.push({ name: '不够扣时返回 null', bag: snapshotBag(bag), removeByIdWasNull: after === null });
  }

  // 指定格子扣光要把格子清空
  {
    let bag = ZX.Inventory.emptyBag();
    bag = ZX.Inventory.add(bag, 'c_xiaohuan', 3).bag;
    const after = ZX.Inventory.removeAt(bag, 0, 3);
    record('扣光后格子要变空', after, { firstEmpty: ZX.Inventory.firstEmpty(after) });
  }

  // 穿装备：旧的回到刚空出来那一格
  {
    let bag = ZX.Inventory.emptyBag();
    bag = ZX.Inventory.add(bag, 'w_chaidao', 1).bag;
    bag = ZX.Inventory.add(bag, 'w_qingyunjian', 1).bag;
    let equip = ZX.Inventory.emptyEquip();

    const e1 = ZX.Inventory.equip(bag, equip, 0, 'qingyun', 10);
    const e2 = ZX.Inventory.equip(e1.bag, e1.equip, 1, 'qingyun', 10);
    cases.push({
      name: '换装备时旧的回到原格',
      bag: snapshotBag(e2.bag),
      equip: snapshotEquip(e2.equip),
      replacedId: e2.replaced ? e2.replaced.id : null,
    });
  }

  // 等级不够穿不上
  {
    let bag = ZX.Inventory.emptyBag();
    bag = ZX.Inventory.add(bag, 'w_qingyunjian', 1).bag;
    const e = ZX.Inventory.equip(bag, ZX.Inventory.emptyEquip(), 0, 'qingyun', 1);
    cases.push({ name: '等级不够穿不上', bag: snapshotBag(bag), equipWasNull: e === null });
  }

  // 脱装备：背包满了脱不下来
  {
    let bag = ZX.Inventory.emptyBag();
    bag = ZX.Inventory.add(bag, 'c_xiaohuan', 99 * CFG.BAG_SIZE).bag;
    const equip = ZX.Inventory.emptyEquip();
    equip.weapon = 'w_chaidao';
    const u = ZX.Inventory.unequip(bag, equip, 'weapon');
    cases.push({ name: '背包满了脱不下装备', full: ZX.Inventory.isFull(bag), unequipWasNull: u === null });
  }

  // 全身装备属性合计
  {
    const equip = ZX.Inventory.emptyEquip();
    equip.weapon = 'w_qingyunjian';
    equip.robe = 'a_qingyunpao';
    equip.boots = 's_caoxie';
    cases.push({
      name: '全身装备属性合计',
      equip: snapshotEquip(equip),
      stats: ZX.Inventory.equipStats(equip),
    });
  }

  return { cases: cases };
}

// ── 玩家 ──────────────────────────────────────────────────────

export function buildPlayer({ ZX }) {
  const CFG = ZX.CONFIG;
  const created = [];
  for (const sect of ZX.SECTS) {
    const p = ZX.Player.create('测试', sect.key);
    created.push({ sect: sect.key, snapshot: snapshotPlayer(p) });
  }

  // 升级：一次给一大笔经验，看连升几级、属性和血量有没有跟上
  const leveling = [];
  {
    const p = ZX.Player.create('测试', 'qingyun');
    for (const gain of [100, 500, 5000, 50000, 999999]) {
      const levels = ZX.Player.gainExp(p, gain);
      leveling.push({ gain: gain, levels: levels, level: p.level, exp: p.exp, points: p.points, hp: p.hp, mp: p.mp });
    }
  }

  // 加点
  const spending = [];
  {
    const p = ZX.Player.create('测试', 'tianyin');
    ZX.Player.gainExp(p, 50000);
    for (const key of ['con', 'spi', 'agi', 'wit', 'con']) {
      const ok = ZX.Player.spendPoint(p, key);
      spending.push({ key: key, ok: ok, points: p.points, base: Object.assign({}, p.base), stats: snapshotStats(p.stats) });
    }
    spending.push({ key: 'nosuch', ok: ZX.Player.spendPoint(p, 'nosuch'), points: p.points, base: Object.assign({}, p.base), stats: snapshotStats(p.stats) });
  }

  // 带增益重算：atkUp / defUp 是最后乘再取整，
  // 取整方向写错了只有在这里露馅（不带增益时乘数是 1，floor 和 round 看不出区别）
  const buffed = [];
  {
    for (const amounts of [[0.25, 0], [0, 0.4], [0.33, 0.17], [1.5, 0.05]]) {
      const p = ZX.Player.create('测试', 'qingyun');
      ZX.Player.gainExp(p, 120000);
      if (amounts[0]) ZX.Combat.addBuff(p, { kind: 'atkUp', ms: 9000, amount: amounts[0] });
      if (amounts[1]) ZX.Combat.addBuff(p, { kind: 'defUp', ms: 9000, amount: amounts[1] });
      ZX.Combat.addBuff(p, { kind: 'lifesteal', ms: 9000, amount: 0.12 });
      ZX.Player.recompute(p);
      buffed.push({ atkUp: amounts[0], defUp: amounts[1], level: p.level, stats: snapshotStats(p.stats) });
    }
  }

  // 上限变化时当前血量按比例走：脱装备不该把人脱死
  const equipSwap = [];
  {
    const p = ZX.Player.create('测试', 'guiwang');
    ZX.Player.gainExp(p, 200000);
    equipSwap.push({ step: '升级后', hp: p.hp, maxHp: p.stats.hp });

    const off = ZX.Inventory.unequip(p.bag, p.equip, 'robe');
    if (off) {
      p.bag = off.bag;
      p.equip = off.equip;
      ZX.Player.recompute(p);
      equipSwap.push({ step: '脱掉衣袍', hp: p.hp, maxHp: p.stats.hp });
    }
  }

  // 吃药：满血时回不了、修为不够吃不了、正常吃
  const potions = [];
  {
    const p = ZX.Player.create('测试', 'qingyun');
    const full = ZX.Player.usePotion(p, 0);
    potions.push({ step: '满血吃药', ok: full.ok, healed: full.healed, restored: full.restored, hp: p.hp });

    p.hp = 10;
    p.mp = 5;
    const hurt = ZX.Player.usePotion(p, 0);
    potions.push({ step: '残血吃药', ok: hurt.ok, healed: hurt.healed, restored: hurt.restored, hp: p.hp, mp: p.mp });
  }

  // 自然回复：站着不动才回，且要等 REGEN_DELAY_MS
  const regen = [];
  {
    const p = ZX.Player.create('测试', 'qingyun');
    p.hp = 100;
    p.mp = 10;
    for (const [dt, moving, inCombat] of [[1000, true, false], [1000, false, false], [2000, false, false], [1000, false, true], [3000, false, false]]) {
      ZX.Player.tickRegen(p, dt, moving, inCombat);
      regen.push({ dt: dt, moving: moving, inCombat: inCombat, idleMs: p.idleMs, hp: p.hp, mp: p.mp });
    }
  }

  // 死亡掉经验 + 复活回半血；死前身上带增益，复活后不能还留着
  const death = [];
  {
    const p = ZX.Player.create('测试', 'fenxiang');
    ZX.Player.gainExp(p, 30000);
    ZX.Combat.addBuff(p, { kind: 'atkUp', ms: 9000, amount: 0.5 });
    ZX.Player.recompute(p);
    death.push({ step: '带增益', exp: p.exp, atk: p.stats.atk, buffs: p.buffs.length });

    const lost = ZX.Player.die(p);
    death.push({ step: '死亡', lost: lost, exp: p.exp, atk: p.stats.atk, buffs: p.buffs.length, dead: p.dead, deaths: p.deaths });

    ZX.Player.revive(p);
    death.push({ step: '复活', hp: p.hp, mp: p.mp, dead: p.dead, hurtIframe: p.hurtIframe });
  }

  return {
    created: created,
    leveling: leveling,
    spending: spending,
    buffed: buffed,
    equipSwap: equipSwap,
    potions: potions,
    regen: regen,
    death: death,
    moveSpeed: buildMoveSpeed(ZX),
  };
}

function buildMoveSpeed(ZX) {
  const out = [];
  const p = ZX.Player.create('测试', 'qingyun');
  out.push({ step: '基础', speed: ZX.Player.moveSpeed(p), attackMs: ZX.Player.attackInterval(p) });

  ZX.Combat.addBuff(p, { kind: 'slow', ms: 3000, amount: 0.45 });
  out.push({ step: '减速', speed: ZX.Player.moveSpeed(p), attackMs: ZX.Player.attackInterval(p) });

  p.base.agi += 200;
  ZX.Player.recompute(p);
  out.push({ step: '身法拉满', speed: ZX.Player.moveSpeed(p), attackMs: ZX.Player.attackInterval(p) });
  return out;
}
