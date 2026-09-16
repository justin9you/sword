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

// 技能释放、弹道、法宝主动。对应 src/skills.js。
/**
 * 技能释放与弹道。这块是随机数消耗最密集的地方：
 * 一发范围技能打中 5 只怪就是 5 次伤害结算、最多 10 个随机数，
 * 顺序错一个后面全歪，所以每条用例都记下"这段一共摇了几次"。
 *
 * 覆盖点挑的是翻译最容易走样的地方：
 *   - 释放失败的几种理由（冷却 / 灵力 / 倒下 / 定身）要一句不差
 *   - strike 只打前方半圆内最近的 3 个，而且排序要稳定
 *   - bolt 撞一只就停，pierce 穿过去继续飞，blast 路上不碰、落点才炸
 *   - 血炼类技能扣自己的血；护盾 / 增益要走 recompute
 */
export function buildSkills({ ZX, withRandom }) {
  const CFG = ZX.CONFIG;

  /** 造一局：一张图、一个玩家、一套记录用的钩子 */
  function newGame(seed, sectKey, level) {
    ZX.U.seedUid(0);
    const world = ZX.World.create('caomiao');
    const player = ZX.Player.create('测试', sectKey || 'qingyun');
    if (level) ZX.Player.gainExp(player, 999999999);
    player.level = level || player.level;
    ZX.Player.recompute(player);
    player.hp = player.stats.hp;
    player.mp = player.stats.mp;
    player.x = world.w / 2;
    player.y = world.h / 2;
    player.facing = { x: 1, y: 0 };

    const events = [];
    const game = {
      player: player,
      world: world,
      fx: ZX.Skills.newFx(),
      hooks: {
        floater: (x, y, amount, kind) => events.push({ kind: 'floater', amount: amount, tag: kind }),
        sfx: (name) => events.push({ kind: 'sfx', tag: name }),
        log: (msg, kind) => events.push({ kind: 'log', tag: kind }),
        onCast: (def) => events.push({ kind: 'cast', tag: def.key }),
        onDeath: (m) => events.push({ kind: 'death', tag: m.def.id }),
        onDot: () => {},
        onHitPlayer: () => {},
      },
    };
    return { game: game, events: events, seed: seed };
  }

  /** 把怪摆到玩家跟前，免得靠刷怪的随机位置碰运气 */
  function placeMonsters(game, spec) {
    const p = game.player;
    game.world.monsters.length = 0;
    for (const [id, dx, dy] of spec) {
      const def = ZX.MONSTERS.byId(id);
      const m = {
        uid: ZX.U.uid(), def: def,
        x: p.x + dx, y: p.y + dy, homeX: p.x + dx, homeY: p.y + dy,
        hp: def.maxHp, maxHp: def.maxHp,
        state: 'idle', atkCd: 0, wanderCd: 9999,
        vx: 0, vy: 0, buffs: [], flash: 0, dead: false, castFx: 0,
      };
      game.world.monsters.push(m);
    }
  }

  // 故意不记 uid：uid 是个全局自增计数器，记了的话这组样本就隐式依赖
  // 「前面几组一共用掉多少 uid」，加一条别的用例就会把这里全打乱。
  // 这组怪是手工按顺序摆的，按下标认人就够了。
  const snapMonsters = (game) =>
    game.world.monsters.map((m) => ({
      id: m.def.id, hp: m.hp, x: m.x, y: m.y, dead: !!m.dead,
      buffs: m.buffs.map((b) => ({ kind: b.kind, ms: b.ms, dps: b.dps == null ? 0 : b.dps, amount: b.amount == null ? 0 : b.amount })),
    }));

  const snapBolts = (game) =>
    game.fx.bolts.map((b) => ({ kind: b.kind, x: b.x, y: b.y, dx: b.dx, dy: b.dy, speed: b.speed, left: b.left, width: b.width }));

  const snapPlayer = (p) => ({ hp: p.hp, mp: p.mp, swingMs: p.swingMs, atk: p.stats.atk, def: p.stats.def, buffs: p.buffs.map((b) => b.kind) });

  // 1. 释放失败的几种理由
  const failures = [];
  {
    const { game } = newGame(5000);
    const p = game.player;
    const sect = ZX.sect(p.sect);
    const skill = sect.skills[0];

    // 灵力不足
    p.mp = 0;
    failures.push({ step: '灵力不足', skillKey: skill.key, ok: ZX.Skills.cast(game, skill, p.x + 100, p.y).ok, msg: ZX.Skills.cast(game, skill, p.x + 100, p.y).msg });

    // 冷却中
    p.mp = p.stats.mp;
    ZX.Skills.cast(game, skill, p.x + 100, p.y);
    const cooling = ZX.Skills.cast(game, skill, p.x + 100, p.y);
    failures.push({ step: '冷却中', skillKey: skill.key, ok: cooling.ok, msg: cooling.msg });

    // 定身
    p.cd[skill.key] = 0;
    ZX.Combat.addBuff(p, { kind: 'stun', ms: 2000 });
    const stunned = ZX.Skills.cast(game, skill, p.x + 100, p.y);
    failures.push({ step: '被定身', skillKey: skill.key, ok: stunned.ok, msg: stunned.msg });

    // 倒下
    p.buffs.length = 0;
    p.dead = true;
    const down = ZX.Skills.cast(game, skill, p.x + 100, p.y);
    failures.push({ step: '已倒下', skillKey: skill.key, ok: down.ok, msg: down.msg });
  }

  // 2. 各门派各技能各放一次，怪固定摆位
  const casts = [];
  for (const sect of ZX.SECTS) {
    for (const skill of sect.skills) {
      const seed = 5100 + casts.length;
      const { game, events } = newGame(seed, sect.key, 65);
      placeMonsters(game, [
        ['yegou', 40, 0], ['shanzhu', 70, 30], ['qingshe', -60, 10],
        ['shanzei', 120, -20], ['linghou', 200, 5],
      ]);
      const p = game.player;

      const { value: res, used } = withRandom(seed, () => ZX.Skills.cast(game, skill, p.x + 300, p.y));

      casts.push({
        seed: seed, sect: sect.key, skillKey: skill.key, kind: skill.kind,
        ok: res.ok, msg: res.msg == null ? null : res.msg,
        randomsUsed: used.length,
        player: snapPlayer(p),
        monsters: snapMonsters(game),
        bolts: snapBolts(game),
        visuals: game.fx.visuals.map((v) => ({ kind: v.kind, r: v.r, ms: v.ms })),
        events: events,
      });
    }
  }

  // 3. 弹道推进：bolt 撞一只就停，pierce 穿过去继续飞，blast 落点才炸
  const flights = [];
  for (const [seed, sectKey, skillKey] of [[5300, 'qingyun', 'qy1'], [5301, 'qingyun', 'qy2'], [5302, 'qingyun', 'qy3']]) {
    const { game, events } = newGame(seed, sectKey, 65);
    placeMonsters(game, [['yegou', 80, 0], ['shanzhu', 160, 0], ['qingshe', 240, 0]]);
    const p = game.player;
    const skill = ZX.sect(sectKey).skills.find((s) => s.key === skillKey);

    const { used } = withRandom(seed, () => {
      ZX.Skills.cast(game, skill, p.x + 300, p.y);
      for (let i = 0; i < 20; i++) ZX.Skills.update(game, 50);
      return null;
    });

    flights.push({
      seed: seed, skillKey: skillKey, kind: skill.kind, randomsUsed: used.length,
      monsters: snapMonsters(game), bolts: snapBolts(game),
      visuals: game.fx.visuals.length, events: events,
    });
  }

  // 4. 普攻：面朝最近的怪，最多打 3 个
  const basics = [];
  {
    const seed = 5400;
    const { game, events } = newGame(seed, 'qingyun', 30);
    placeMonsters(game, [
      ['yegou', 30, 0], ['shanzhu', 45, 10], ['qingshe', 20, -20],
      ['shanzei', 35, 25], ['linghou', -300, 0],
    ]);
    const { value: hit, used } = withRandom(seed, () => ZX.Skills.basicAttack(game));
    basics.push({
      seed: seed, hit: hit, randomsUsed: used.length,
      facingX: game.player.facing.x, facingY: game.player.facing.y,
      monsters: snapMonsters(game), events: events,
    });

    // 周围没怪时打空
    const { game: g2 } = newGame(5401, 'qingyun', 30);
    g2.world.monsters.length = 0;
    basics.push({ seed: 5401, hit: ZX.Skills.basicAttack(g2), randomsUsed: 0, facingX: g2.player.facing.x, facingY: g2.player.facing.y, monsters: [], events: [] });
  }

  // 5. 法宝主动
  const talismans = [];
  {
    // 八种主动效果各挑一件，把 castTalisman 的每条分支都走一遍
    const gear = ['t_jinling', 't_shehun', 't_shixuezhu', 't_hehuanling', 't_xuanhuojian', 't_qiweiwugong', 't_liuhejing', 't_tianya'];
    const seeds = gear.map((_, i) => 5500 + i);
    for (let i = 0; i < gear.length; i++) {
      const item = ZX.ITEMS.byId(gear[i]);
      if (!item || !item.active) continue;
      const seed = seeds[i];
      const { game, events } = newGame(seed, 'qingyun', 65);
      placeMonsters(game, [['yegou', 40, 0], ['shanzhu', 70, 30], ['qingshe', -60, 10]]);
      const p = game.player;
      p.equip.talisman = item.id;
      ZX.Player.recompute(p);
      p.hp = Math.floor(p.stats.hp * 0.5);

      const { value: res, used } = withRandom(seed, () => ZX.Skills.castTalisman(game, p.x + 100, p.y));
      talismans.push({
        seed: seed, itemId: item.id, activeKind: item.active.kind,
        ok: res.ok, msg: res.msg == null ? null : res.msg,
        randomsUsed: used.length,
        player: snapPlayer(p), monsters: snapMonsters(game), events: events,
      });
    }

    // 没装法宝
    const { game: g } = newGame(5599, 'qingyun', 10);
    const none = ZX.Skills.castTalisman(g, 0, 0);
    talismans.push({ seed: 5599, itemId: null, activeKind: null, ok: none.ok, msg: none.msg, randomsUsed: 0, player: snapPlayer(g.player), monsters: [], events: [] });
  }

  // 6. 冷却推进与特效寿命
  const upkeep = [];
  {
    const { game } = newGame(5600, 'qingyun', 65);
    placeMonsters(game, [['yegou', 40, 0]]);
    const p = game.player;
    const skill = ZX.sect('qingyun').skills[0];
    withRandom(5600, () => ZX.Skills.cast(game, skill, p.x + 100, p.y));
    for (const dt of [100, 300, 1000, 5000]) {
      ZX.Skills.update(game, dt);
      upkeep.push({ dt: dt, cd: p.cd[skill.key], bolts: game.fx.bolts.length, visuals: game.fx.visuals.length });
    }
  }

  return { failures: failures, casts: casts, flights: flights, basics: basics, talismans: talismans, upkeep: upkeep };
}
