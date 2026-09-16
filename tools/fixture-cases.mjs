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

// ── 战斗数值 ──────────────────────────────────────────────────

/** 随机序列本身。两边的 mulberry32 对不上的话，后面全白搭，先把这个钉死 */
export function buildRng({ mulberry32 }) {
  const roll = mulberry32(12345);
  const values = [];
  for (let i = 0; i < 64; i++) values.push(roll());
  return { seed: 12345, values: values };
}

export function buildExp({ ZX }) {
  const cases = [];
  for (let lv = 1; lv <= ZX.CONFIG.MAX_LEVEL; lv++) {
    const need = ZX.Stats.expToNext(lv);
    cases.push({ level: lv, need: need === Infinity ? -1 : need });
  }
  return { cases: cases };
}

export function buildDerive({ ZX, mulberry32 }) {
  const roll = mulberry32(777);
  const cases = [];
  for (const sect of ZX.SECTS) {
    for (let i = 0; i < 40; i++) {
      const level = 1 + Math.floor(roll() * ZX.CONFIG.MAX_LEVEL);
      const base = {
        con: Math.floor(roll() * 60),
        spi: Math.floor(roll() * 60),
        agi: Math.floor(roll() * 60),
        wit: Math.floor(roll() * 60),
      };
      cases.push({ sect: sect.key, level: level, base: base, expect: ZX.Stats.derive(level, base, sect) });
    }
  }
  return { cases: cases };
}

export function buildDamage({ ZX, mulberry32, withRandom }) {
  const roll = mulberry32(2024);
  const cases = [];

  for (let i = 0; i < 200; i++) {
    const atk = Math.floor(roll() * 900) + 10;
    const def = Math.floor(roll() * 400);
    const kind = roll() < 0.5 ? 'phys' : 'magic';
    const power = 0.8 + roll() * 3;
    const critRate = i % 4 === 0 ? 0 : roll() * 0.6;
    const levelGap = Math.floor(roll() * 41) - 20;
    const ignoreDef = i % 5 === 0 ? roll() * 0.5 : 0;
    const seed = 9000 + i;

    const { value: out, used } = withRandom(seed, () =>
      ZX.Combat.damage(atk, def, kind, power, {
        critRate: critRate, levelGap: levelGap, ignoreDef: ignoreDef,
      })
    );

    cases.push({
      atk, def, kind, power, critRate, levelGap, ignoreDef,
      seed: seed, randomsUsed: used.length,
      expect: { amount: out.amount, crit: out.crit },
    });
  }
  return { cases: cases };
}

export function buildBuffs({ ZX }) {
  const cases = [];

  {
    const t = { buffs: [] };
    ZX.Combat.addBuff(t, { kind: 'atkUp', ms: 3000, amount: 0.2 });
    ZX.Combat.addBuff(t, { kind: 'atkUp', ms: 1000, amount: 0.35 });
    ZX.Combat.addBuff(t, { kind: 'shield', ms: 5000, value: 120 });
    cases.push({ name: '同名刷新取更强', buffs: t.buffs.map(cleanBuff) });
  }

  {
    const t = { buffs: [{ kind: 'burn', ms: 5000, dps: 6 }] };
    const ticks = [];
    for (let i = 0; i < 20; i++) {
      const r = ZX.Combat.tickBuffs(t, 100, null);
      ticks.push({ dot: r.dot, expired: r.expired });
    }
    cases.push({ name: '灼烧攒够1点才结算', ticks: ticks, buffs: t.buffs.map(cleanBuff) });
  }

  {
    const t = { buffs: [{ kind: 'shield', ms: 9000, value: 100 }] };
    const through = [];
    for (const hit of [30, 40, 50, 20, 10]) through.push(ZX.Combat.absorb(t, hit));
    cases.push({ name: '护盾吸收', through: through, buffs: t.buffs.map(cleanBuff) });
  }

  {
    const t = {
      buffs: [
        { kind: 'atkUp', ms: 200, amount: 0.3 },
        { kind: 'shield', ms: 5000, value: 80 },
      ],
    };
    const r1 = ZX.Combat.tickBuffs(t, 150, null);
    const r2 = ZX.Combat.tickBuffs(t, 150, null);
    cases.push({
      name: '部分过期也要报 expired',
      ticks: [{ dot: r1.dot, expired: r1.expired }, { dot: r2.dot, expired: r2.expired }],
      buffs: t.buffs.map(cleanBuff),
    });
  }

  return { cases: cases };
}

export function buildMisc({ ZX, withRandom }) {
  const lifesteal = [];
  for (const [rate, dealt] of [[0, 100], [0.1, 100], [0.05, 3], [0.5, 77], [0.9, 1]]) {
    lifesteal.push({ rate: rate, dealt: dealt, expect: ZX.Combat.lifesteal(rate, dealt) });
  }

  const dodge = [];
  for (let i = 0; i < 30; i++) {
    const rate = i / 30;
    const seed = 500 + i;
    const { value } = withRandom(seed, () => ZX.Combat.dodged(rate));
    dodge.push({ rate: rate, seed: seed, expect: value });
  }

  return { lifesteal: lifesteal, dodge: dodge };
}

// ── 背包 ──────────────────────────────────────────────────────

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


// ── 任务 ──────────────────────────────────────────────────────

/**
 * 任务推进。重点在两处容易翻错的地方：
 * 一是 goalMet（打够没）和 complete（能不能交）分开——等级不够时目标怪不该还高亮；
 * 二是杀怪计数不看等级，低于建议等级打的怪照样算数。
 */
export function buildQuest({ ZX }) {
  const steps = [];
  const p = ZX.Player.create('测试', 'qingyun');

  const snap = (step) =>
    steps.push({
      step: step,
      current: p.quest.current,
      progress: p.quest.progress,
      level: p.level,
      goalMet: ZX.Quest.goalMet(p),
      levelShort: ZX.Quest.levelShort(p),
      complete: ZX.Quest.complete(p),
      giver: currentGiver(ZX, p),
      turnInNpc: currentTurnIn(ZX, p),
      // 针对当前任务自己的发布人 / 复命人问，而不是固定问某一个 NPC——
      // 「目标打完但等级不够」是唯一能区分 goalMet 和 complete 的时刻，
      // 问错人就永远撞不上它
      isGiverAtGiver: ZX.Quest.isGiver(p, currentGiver(ZX, p)),
      waitingAtTurnIn: ZX.Quest.waitingForLevel(p, currentTurnIn(ZX, p)),
      canTurnInAtTurnIn: ZX.Quest.canTurnInAt(p, currentTurnIn(ZX, p)),
      targetMonsterId: ZX.Quest.targetMonsterId(p),
      targetMaps: mapHints(ZX.Quest.targetMaps(p)),
      doneCount: Object.keys(p.quest.done).length,
    });

  snap('刚建号');

  // q1 是杀 6 只野狗，先杀 3 只
  const yegou = ZX.MONSTERS.byId('yegou');
  for (let i = 0; i < 3; i++) ZX.Quest.onKill(p, yegou);
  snap('杀了3只');

  // 杀别的怪不该算进度
  ZX.Quest.onKill(p, ZX.MONSTERS.byId('shanzhu'));
  snap('杀了只野猪(不该算)');

  for (let i = 0; i < 3; i++) ZX.Quest.onKill(p, yegou);
  snap('杀满6只');

  // 杀超了也不该继续加
  ZX.Quest.onKill(p, yegou);
  snap('超杀一只');

  const r1 = ZX.Quest.turnIn(p, 'linjingyu');
  const turnIns = [
    {
      step: '交 q1',
      exp: r1.exp,
      gold: r1.gold,
      items: r1.items,
      levels: r1.levels,
      overflow: r1.overflow,
      nextKey: r1.next ? r1.next.key : null,
      playerGold: p.gold,
      playerLevel: p.level,
    },
  ];
  snap('交完 q1');

  // q2：先把目标打完，等级不够时不能交
  const shanzei = ZX.MONSTERS.byId('shanzei');
  for (let i = 0; i < 5; i++) ZX.Quest.onKill(p, shanzei);
  snap('q2 目标打完');

  // 找错人交不了
  turnIns.push({ step: '找错人交任务', wasNull: ZX.Quest.turnIn(p, 'tianbuyi') === null });

  return { steps: steps, turnIns: turnIns };
}

function currentGiver(ZX, p) {
  const q = ZX.Quest.current(p);
  return q ? q.giver : null;
}

function currentTurnIn(ZX, p) {
  const q = ZX.Quest.current(p);
  return q ? q.turnIn : null;
}

/** targetMaps 返回的是 { 地图key: 'hunt' | 'turnin' }，拍平成数组方便对照 */
function mapHints(obj) {
  return Object.keys(obj).map((k) => ({ map: k, hint: obj[k] }));
}

// ── 场景 ──────────────────────────────────────────────────────

/**
 * 场景。随机的地方特别多（刷怪点、闲逛方向、掉落表），
 * 所以每段都跑在自己的种子下，连怪的 uid 和坐标都要对得上。
 */
export function buildWorld({ ZX, withRandom }) {
  const snapMonster = (m) => ({
    uid: m.uid,
    id: m.def.id,
    x: m.x, y: m.y, homeX: m.homeX, homeY: m.homeY,
    hp: m.hp, maxHp: m.maxHp,
    state: m.state, atkCd: m.atkCd, wanderCd: m.wanderCd,
    vx: m.vx, vy: m.vy, flash: m.flash, castFx: m.castFx,
    dead: !!m.dead, isBoss: !!m.isBoss,
  });

  const snapshot = (w) => ({
    key: w.key,
    w: w.w, h: w.h,
    blocks: w.blocks.length,
    portals: w.portals.map((p) => ({ to: p.to, x: p.x, y: p.y, r: p.r })),
    npcs: w.npcs.map((n) => ({ key: n.def.key, x: n.x, y: n.y })),
    monsters: w.monsters.map(snapMonster),
    drops: w.drops.map((d) => ({ uid: d.uid, id: d.id, n: d.n, x: d.x, y: d.y, life: d.life, born: d.born })),
    bossDead: w.bossDead,
    bossTimer: w.bossTimer,
  });

  /** 建图。uid 从 1 开始数，所以每次都把计数器归零 */
  const build = (mapKey, seed) =>
    withRandom(seed, () => {
      ZX.U.seedUid(0);
      return ZX.World.create(mapKey);
    });

  const built = [];
  const MAPS = ['caomiao', 'qingyun', 'heyang'];
  for (let i = 0; i < MAPS.length; i++) {
    const seed = 4000 + i;
    const { value: w, used } = build(MAPS[i], seed);
    built.push({ mapKey: MAPS[i], seed: seed, randomsUsed: used.length, world: snapshot(w) });
  }

  // 碰撞与滑墙
  const collisions = [];
  {
    const { value: w } = build('caomiao', 4100);
    const T = ZX.CONFIG.TILE;
    for (const [x, y, r] of [[0, 0, 12], [T * 7, T * 7, 12], [T * 20, T * 24, 12], [w.w - 5, 100, 12], [T * 6.5, T * 6.5, 20]]) {
      collisions.push({ x: x, y: y, r: r, blocked: ZX.World.blocked(w, x, y, r), dx: null, dy: null, moveX: 0, moveY: 0 });
    }
    // 斜着撞墙角：应该沿着墙滑，而不是整体卡死
    for (const [x, y, dx, dy, r] of [[T * 5.5, T * 7.5, 30, 0, 12], [T * 7, T * 5.4, 0, 30, 12], [T * 5.6, T * 5.6, 25, 25, 12]]) {
      const out = ZX.World.move(w, x, y, dx, dy, r);
      collisions.push({ x: x, y: y, r: r, blocked: false, dx: dx, dy: dy, moveX: out.x, moveY: out.y });
    }
  }

  // 圆范围命中
  const radius = [];
  {
    const { value: w } = build('caomiao', 4200);
    // 从三个中心各扫一遍半径：总有半径会正好卡在某只怪的边界上，
    // 判据写错就会在那里露馅
    const centers = [
      { x: w.monsters[0].x, y: w.monsters[0].y },
      { x: w.w / 2, y: w.h / 2 },
      { x: w.def.start.x * ZX.CONFIG.TILE, y: w.def.start.y * ZX.CONFIG.TILE },
    ];
    for (const c of centers) {
      for (let r = 0; r <= 700; r += 7) {
        const near = ZX.World.nearest(w, c.x, c.y, 99999);
        radius.push({
          fromX: c.x, fromY: c.y, r: r,
          hitUids: ZX.World.inRadius(w, c.x, c.y, r).map((x) => x.uid),
          nearestUid: near ? near.uid : 0,
        });
      }
    }
  }

  // 推进 60 帧：AI 状态机 + 补刷 + 掉落寿命
  const ticks = [];
  {
    const { value: w } = build('caomiao', 4300);
    const player = ZX.Player.create('测试', 'qingyun');
    player.x = w.def.start.x * ZX.CONFIG.TILE;
    player.y = w.def.start.y * ZX.CONFIG.TILE;

    const hits = [];
    const hooks = {
      onHitPlayer: (m) => hits.push(m.uid),
      onDot: () => {},
      onDeath: (m) => hits.push(-m.uid),
    };

    const { used } = withRandom(4301, () => {
      for (let i = 0; i < 60; i++) ZX.World.update(w, 100, player, hooks);
      return null;
    });
    ticks.push({ seed: 4301, frames: 60, dt: 100, randomsUsed: used.length, hits: hits, world: snapshot(w) });
  }

  // 掉落：普通怪 / 精英 / 首领各摇一遍
  const loot = [];
  {
    const player = ZX.Player.create('测试', 'qingyun');
    player.level = 20;
    // 普通 / 精英 / 真首领各一只。首领那条分支是必掉、跳过摇点的，
    // 随机数消耗个数和普通怪不一样，非覆盖不可
    for (const [seed, monsterId] of [[4400, 'yegou'], [4401, 'zhuyao'], [4402, 'toulang'], [4403, 'qiannianzhuyao'], [4404, 'guiwang']]) {
      const { value } = withRandom(seed, () => {
        ZX.U.seedUid(0);
        const w = ZX.World.create('caomiao');
        const def = ZX.MONSTERS.byId(monsterId);
        const fake = { def: def, x: 500, y: 500, uid: 999 };
        w.drops.length = 0;
        const got = ZX.World.rollLoot(w, fake, player);
        return {
          got: got.map((it) => it.id),
          drops: w.drops.map((d) => ({ id: d.id, n: d.n, x: d.x, y: d.y })),
        };
      });
      loot.push({ seed: seed, monsterId: monsterId, level: player.level, got: value.got, drops: value.drops });
    }
  }

  // 受伤与死亡
  const damage = [];
  {
    const { value: w } = build('caomiao', 4500);
    const m = w.monsters[0];
    ZX.Combat.addBuff(m, { kind: 'shield', ms: 9000, value: 30 });
    const deaths = [];
    const hooks = { onDeath: (x) => deaths.push(x.uid) };
    damage.push({ step: '有盾挨打', real: ZX.World.hurtMonster(w, m, 50, hooks), hp: m.hp, state: m.state, dead: !!m.dead, deaths: deaths.length });
    damage.push({ step: '再挨一下', real: ZX.World.hurtMonster(w, m, 20, hooks), hp: m.hp, state: m.state, dead: !!m.dead, deaths: deaths.length });
    damage.push({ step: '打死', real: ZX.World.hurtMonster(w, m, 99999, hooks), hp: m.hp, state: m.state, dead: !!m.dead, deaths: deaths.length });
  }

  return { built: built, collisions: collisions, radius: radius, ticks: ticks, loot: loot, damage: damage };
}

// ── 快照工具 ──────────────────────────────────────────────────

function cleanBuff(b) {
  return {
    kind: b.kind,
    ms: b.ms,
    frac: b.frac || 0,
    amount: b.amount == null ? null : b.amount,
    value: b.value == null ? null : b.value,
    dps: b.dps == null ? null : b.dps,
  };
}

function snapshotBag(bag) {
  return bag.map((s) => (s ? { id: s.id, n: s.n } : null));
}

function snapshotEquip(e) {
  return {
    weapon: e.weapon || null,
    talisman: e.talisman || null,
    robe: e.robe || null,
    bracer: e.bracer || null,
    boots: e.boots || null,
    pendant: e.pendant || null,
  };
}

function snapshotStats(s) {
  return {
    hp: s.hp, mp: s.mp, atk: s.atk, mag: s.mag, def: s.def, mdef: s.mdef,
    crit: s.crit, dodge: s.dodge, speed: s.speed, lifesteal: s.lifesteal, expBonus: s.expBonus,
  };
}

function snapshotPlayer(p) {
  return {
    name: p.name,
    sect: p.sect,
    level: p.level,
    exp: p.exp,
    gold: p.gold,
    points: p.points,
    base: { con: p.base.con, spi: p.base.spi, agi: p.base.agi, wit: p.base.wit },
    hp: p.hp,
    mp: p.mp,
    stats: snapshotStats(p.stats),
    bag: snapshotBag(p.bag),
    equip: snapshotEquip(p.equip),
  };
}
