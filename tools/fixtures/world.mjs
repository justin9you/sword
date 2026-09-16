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

// 任务推进与场景运行时。对应 src/quest.js 和 src/world.js。
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
  // 注意这些必须是真实存在的地图 key：MAPS.byKey 查不到会悄悄回落到第一张，
  // 写错了就变成把草庙村测了两遍，自己还以为覆盖了三张图
  const MAPS = ['caomiao', 'longshou', 'heyang'];
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
