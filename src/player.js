/**
 * 玩家状态：属性、经验、背包、任务进度、增益。
 *
 * 数值分三层，改任何一层都要 recompute()：
 *   base（加点） → derive（等级+门派换算） → + 装备 + 增益 = stats（打架用的）
 * 当前气血/灵力独立存在 hp/mp 上，上限变了会按比例跟着变，不会因为脱装备暴毙。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var CFG = ZX.CONFIG;
  var U = ZX.U;

  function create(name, sectKey) {
    var sect = ZX.sect(sectKey);
    var p = {
      name: name || '无名',
      sect: sect.key,
      level: 1,
      exp: 0,
      gold: 100,
      points: 0,
      base: {
        con: sect.startBase.con,
        spi: sect.startBase.spi,
        agi: sect.startBase.agi,
        wit: sect.startBase.wit,
      },

      bag: ZX.Inventory.emptyBag(),
      equip: ZX.Inventory.emptyEquip(),

      map: 'caomiao',
      x: 0,
      y: 0,
      facing: { x: 0, y: 1 },

      hp: 1,
      mp: 1,
      stats: null,

      /** { [skillKey]: 还有多少毫秒好 } */
      cd: {},
      /** [{ kind, ms, ... }] 限时增益，见 combat.js */
      buffs: [],

      quest: { current: 'q1', progress: 0, done: {} },
      visited: { caomiao: true },
      kills: 0,
      deaths: 0,
      playMs: 0,

      // 运行时的战斗状态，不入存档
      attackCd: 0,
      hurtIframe: 0,
      swingMs: 0,      // 挥砍动作剩余时长，由 art-actors 画成出手姿势
      idleMs: 0,
      dead: false,
    };

    // 开局给一身褴褛，免得 1 级赤手空拳
    var seed = ZX.Inventory.add(p.bag, 'c_xiaohuan', 5);
    p.bag = seed.bag;
    p.bag = ZX.Inventory.add(p.bag, 'c_juling', 3).bag;
    p.equip.weapon = 'w_shaohuo';
    p.equip.robe = 'a_bu';
    p.equip.boots = 's_caoxie';

    recompute(p);
    p.hp = p.stats.hp;
    p.mp = p.stats.mp;
    return p;
  }

  /** 重算 stats。任何影响属性的操作之后都得调它 */
  function recompute(p) {
    var sect = ZX.sect(p.sect);
    var s = ZX.Stats.derive(p.level, p.base, sect);
    ZX.Stats.addInto(s, ZX.Inventory.equipStats(p.equip));

    // 增益里的百分比加成最后乘，保证"+25% 防御"指的是含装备之后的防御
    var mulAtk = 1;
    var mulDef = 1;
    for (var i = 0; i < p.buffs.length; i++) {
      var b = p.buffs[i];
      if (b.kind === 'atkUp') mulAtk += b.amount;
      if (b.kind === 'defUp') mulDef += b.amount;
      if (b.kind === 'lifesteal') s.lifesteal += b.amount;
    }
    s.atk = Math.floor(s.atk * mulAtk);
    s.mag = Math.floor(s.mag * mulAtk);
    s.def = Math.floor(s.def * mulDef);
    s.mdef = Math.floor(s.mdef * mulDef);

    s.hp = Math.max(1, s.hp);
    s.mp = Math.max(0, s.mp);
    s.crit = U.clamp(s.crit, 0, 0.75);
    s.dodge = U.clamp(s.dodge, 0, 0.6);
    s.lifesteal = U.clamp(s.lifesteal, 0, 0.9);

    var oldMax = p.stats ? p.stats.hp : s.hp;
    var oldMaxMp = p.stats ? p.stats.mp : s.mp;
    p.stats = s;

    // 上限变化时按比例保留当前值，脱装备不会直接死
    if (oldMax !== s.hp && oldMax > 0) p.hp = Math.max(1, Math.round(p.hp * (s.hp / oldMax)));
    if (oldMaxMp !== s.mp && oldMaxMp > 0) p.mp = Math.round(p.mp * (s.mp / oldMaxMp));
    p.hp = U.clamp(p.hp, 0, s.hp);
    p.mp = U.clamp(p.mp, 0, s.mp);
    return p;
  }

  /** 移动速度（像素/秒），含装备加成与减速 debuff */
  function moveSpeed(p) {
    var v = CFG.MOVE_SPEED + p.stats.speed;
    for (var i = 0; i < p.buffs.length; i++) {
      if (p.buffs[i].kind === 'slow') v *= 1 - p.buffs[i].amount;
    }
    return Math.max(40, v);
  }

  /** 普攻间隔：身法越高越快，最多快到 55% */
  function attackInterval(p) {
    var k = 1 - Math.min(0.45, p.base.agi * 0.004);
    return CFG.ATTACK_MS * k;
  }

  /**
   * 加经验。可能连升数级，返回这次升了几级（0 表示没升）。
   * 悟性带来的加成在这里生效。
   */
  function gainExp(p, amount) {
    if (p.level >= CFG.MAX_LEVEL) return 0;
    var got = Math.floor(amount * (1 + p.stats.expBonus));
    p.exp += got;
    var levels = 0;
    while (p.level < CFG.MAX_LEVEL) {
      var need = ZX.Stats.expToNext(p.level);
      if (p.exp < need) break;
      p.exp -= need;
      p.level += 1;
      p.points += CFG.POINTS_PER_LEVEL;
      levels += 1;
    }
    if (levels > 0) {
      recompute(p);
      p.hp = p.stats.hp;
      p.mp = p.stats.mp;
    }
    if (p.level >= CFG.MAX_LEVEL) p.exp = 0;
    return levels;
  }

  /** 加一点基础属性 */
  function spendPoint(p, key) {
    if (p.points <= 0) return false;
    if (ZX.Stats.BASE_KEYS.indexOf(key) < 0) return false;
    p.points -= 1;
    p.base[key] += 1;
    recompute(p);
    return true;
  }

  /** 吃丹药 */
  function usePotion(p, index) {
    var stack = p.bag[index];
    if (!stack) return null;
    var item = ZX.ITEMS.byId(stack.id);
    if (!item || item.type !== 'potion') return null;
    if (item.lv > p.level) return { ok: false, msg: '修为不够，压不住这颗丹的药力。' };

    var u = item.use;
    var healed = 0;
    var restored = 0;
    if (u.hp || u.hpPct) {
      var h = (u.hp || 0) + Math.floor(p.stats.hp * (u.hpPct || 0));
      healed = Math.min(h, p.stats.hp - p.hp);
      p.hp += healed;
    }
    if (u.mp || u.mpPct) {
      var m = (u.mp || 0) + Math.floor(p.stats.mp * (u.mpPct || 0));
      restored = Math.min(m, p.stats.mp - p.mp);
      p.mp += restored;
    }
    p.bag = ZX.Inventory.removeAt(p.bag, index, 1);
    return { ok: true, item: item, healed: healed, restored: restored };
  }

  /** 每帧的自然回复：站着不动一会儿才开始回 */
  function tickRegen(p, dt, moving, inCombat) {
    if (moving || inCombat) {
      p.idleMs = 0;
      return;
    }
    p.idleMs += dt;
    if (p.idleMs < CFG.REGEN_DELAY_MS) return;
    var rate = CFG.REGEN_RATE * (dt / 1000);
    p.hp = Math.min(p.stats.hp, p.hp + p.stats.hp * rate);
    p.mp = Math.min(p.stats.mp, p.mp + p.stats.mp * rate);
  }

  /**
   * 死亡：扣一成经验（不倒退到本级 0 以下），回城。
   * 返回掉了多少经验，给日志用。
   */
  function die(p) {
    var lost = Math.floor(p.exp * CFG.DEATH_EXP_LOSS);
    p.exp = Math.max(0, p.exp - lost);
    p.deaths += 1;
    p.dead = true;
    p.buffs = [];
    // 清 buff 之后必须重算：死的那一刻身上若带着血炼，
    // 加成会跟着一路复活，白捡一身属性
    recompute(p);
    return lost;
  }

  function revive(p) {
    p.dead = false;
    p.hp = Math.max(1, Math.floor(p.stats.hp * 0.5));
    p.mp = Math.max(0, Math.floor(p.stats.mp * 0.5));
    p.hurtIframe = 1200;
  }

  ZX.Player = {
    create: create,
    recompute: recompute,
    moveSpeed: moveSpeed,
    attackInterval: attackInterval,
    gainExp: gainExp,
    spendPoint: spendPoint,
    usePotion: usePotion,
    tickRegen: tickRegen,
    die: die,
    revive: revive,
  };
})(window);
