/**
 * 技能与法宝的释放、弹道、命中结算。
 *
 * 所有技能最终都落到 applyHit() 上——命中判定各不相同，伤害口径只有一个。
 * 飞行物和特效存在 game.fx 里，由 render.js 画，update() 负责推进和销毁。
 *
 * 释放失败时返回一句人话（灵力不够 / 还在冷却），由 UI 直接显示，
 * 不静默失败——玩家按了没反应是最糟的手感。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var U = ZX.U;
  var C = ZX.Combat;
  var W = ZX.World;

  function newFx() {
    return { bolts: [], visuals: [] };
  }

  function visual(game, v) {
    v.life = v.ms;
    game.fx.visuals.push(v);
  }

  /**
   * 单次命中结算：算伤害 → 扣血 → 吸血 → 附加状态 → 飘字。
   * 这是玩家打怪的唯一入口。
   */
  function applyHit(game, m, opt) {
    var p = game.player;
    var s = p.stats;
    var isMagic = opt.dmg === 'magic';
    var atkVal = isMagic ? s.mag : s.atk;
    var defVal = isMagic ? m.def.mdef : m.def.def;

    var res = C.damage(atkVal, defVal, opt.dmg, opt.power, {
      critRate: s.crit,
      levelGap: p.level - m.def.lv,
    });

    var real = W.hurtMonster(game.world, m, res.amount, game.hooks);
    game.hooks.floater(m.x, m.y - m.def.radius - 8, real, res.crit ? 'crit' : 'hit');

    // 吸血：技能自带的 + 装备/增益的，取和
    var steal = (opt.lifesteal || 0) + s.lifesteal;
    if (steal > 0 && !p.dead) {
      var back = C.lifesteal(steal, real);
      var room = p.stats.hp - p.hp;
      if (room > 0) {
        var got = Math.min(room, back);
        p.hp += got;
        game.hooks.floater(p.x, p.y - 34, got, 'heal');
      }
    }

    // 附加状态
    if (opt.burn) {
      C.addBuff(m, { kind: 'burn', ms: opt.burnMs || 4000, dps: atkVal * opt.burn });
    }
    if (opt.poison) {
      C.addBuff(m, { kind: 'poison', ms: opt.poisonMs || 6000, dps: atkVal * opt.poison });
    }
    if (opt.stunMs) C.addBuff(m, { kind: 'stun', ms: opt.stunMs });
    if (opt.charmMs) C.addBuff(m, { kind: 'charm', ms: opt.charmMs });
    if (opt.slow) C.addBuff(m, { kind: 'slow', ms: opt.slowMs || 3000, amount: opt.slow });
    if (opt.knock) {
      var d = U.dirTo(p.x, p.y, m.x, m.y);
      var np = W.move(game.world, m.x, m.y, d.x * opt.knock, d.y * opt.knock, m.def.radius);
      m.x = np.x;
      m.y = np.y;
    }

    return real;
  }

  // ── 各种命中形状 ────────────────────────────────────────
  function doNova(game, x, y, radius, opt) {
    var list = W.inRadius(game.world, x, y, radius);
    for (var i = 0; i < list.length; i++) applyHit(game, list[i], opt);
    visual(game, { kind: 'nova', x: x, y: y, r: radius, ms: 380, color: opt.color });
    game.hooks.sfx('nova');
    return list.length;
  }

  function doStrike(game, opt) {
    var p = game.player;
    var range = opt.range || 90;
    // 朝向前方半圆内、射程内的怪，按距离取最多 3 个
    var cands = W.inRadius(game.world, p.x, p.y, range);
    var hits = [];
    for (var i = 0; i < cands.length; i++) {
      var m = cands[i];
      var d = U.dirTo(p.x, p.y, m.x, m.y);
      if (d.x * p.facing.x + d.y * p.facing.y > -0.1) hits.push(m);
    }
    hits.sort(function (a, b) {
      return U.dist2(p.x, p.y, a.x, a.y) - U.dist2(p.x, p.y, b.x, b.y);
    });
    hits = hits.slice(0, 3);

    var times = opt.hits || 1;
    for (var t = 0; t < times; t++) {
      for (var j = 0; j < hits.length; j++) {
        if (!hits[j].dead) applyHit(game, hits[j], opt);
      }
    }
    visual(game, {
      kind: 'slash', x: p.x, y: p.y, r: range,
      ax: p.facing.x, ay: p.facing.y, ms: 220, color: opt.color,
    });
    game.hooks.sfx('slash');
    return hits.length;
  }

  function doPierce(game, tx, ty, opt) {
    var p = game.player;
    var dir = U.dirTo(p.x, p.y, tx, ty);
    game.fx.bolts.push({
      uid: U.uid(),
      kind: 'pierce',
      x: p.x, y: p.y,
      dx: dir.x, dy: dir.y,
      speed: opt.speed || 600,
      left: opt.range || 360,
      width: opt.width || 26,
      opt: opt,
      hit: {},
      color: opt.color,
    });
    game.hooks.sfx('cast');
  }

  function doBolt(game, tx, ty, opt) {
    var p = game.player;
    var dir = U.dirTo(p.x, p.y, tx, ty);
    game.fx.bolts.push({
      uid: U.uid(),
      kind: 'bolt',
      x: p.x, y: p.y,
      dx: dir.x, dy: dir.y,
      speed: opt.speed || 420,
      left: opt.range || 320,
      width: 14,
      opt: opt,
      hit: {},
      color: opt.color,
    });
    game.hooks.sfx('cast');
  }

  function doBlast(game, tx, ty, opt) {
    var p = game.player;
    // 落点钳在射程内，点太远就打在射程边上，而不是放空
    var d = U.dist(p.x, p.y, tx, ty);
    var max = opt.range || 300;
    if (d > max) {
      var dir = U.dirTo(p.x, p.y, tx, ty);
      tx = p.x + dir.x * max;
      ty = p.y + dir.y * max;
    }
    game.fx.bolts.push({
      uid: U.uid(),
      kind: 'blast',
      x: p.x, y: p.y,
      tx: tx, ty: ty,
      dx: 0, dy: 0,
      speed: 560,
      left: U.dist(p.x, p.y, tx, ty) + 1,
      width: 12,
      opt: opt,
      hit: {},
      color: opt.color,
    });
    var dir2 = U.dirTo(p.x, p.y, tx, ty);
    var last = game.fx.bolts[game.fx.bolts.length - 1];
    last.dx = dir2.x;
    last.dy = dir2.y;
    game.hooks.sfx('cast');
  }

  // ── 释放 ────────────────────────────────────────────────
  /**
   * 放技能。tx/ty 是瞄准点（鼠标位置或摇杆方向上的一点）。
   * 返回 { ok, msg }。
   */
  function cast(game, def, tx, ty) {
    var p = game.player;
    if (p.dead) return { ok: false, msg: '你已经倒下了。' };
    if (C.disabled(p)) return { ok: false, msg: '动弹不得！' };
    if ((p.cd[def.key] || 0) > 0) {
      return { ok: false, msg: def.name + ' 还需 ' + (p.cd[def.key] / 1000).toFixed(1) + ' 秒' };
    }
    if (p.mp < def.mp) return { ok: false, msg: '灵力不足。' };

    var costHp = def.costHp ? Math.floor(p.stats.hp * def.costHp) : 0;
    if (costHp && p.hp <= costHp) return { ok: false, msg: '气血不足以支撑血炼。' };

    p.mp -= def.mp;
    if (costHp) {
      p.hp -= costHp;
      game.hooks.floater(p.x, p.y - 34, costHp, 'hurt');
    }
    p.cd[def.key] = def.cd;

    var opt = {
      dmg: def.dmg,
      power: def.power,
      lifesteal: def.lifesteal,
      burn: def.burn, burnMs: def.burnMs,
      stunMs: def.stunMs,
      slow: def.slow, slowMs: def.slowMs,
      knock: def.knock,
      hits: def.hits,
      range: def.range,
      speed: def.speed,
      width: def.width,
      radius: def.radius,
      color: def.color,
    };

    switch (def.kind) {
      case 'strike':
        doStrike(game, opt);
        break;
      case 'bolt':
        doBolt(game, tx, ty, opt);
        break;
      case 'pierce':
        doPierce(game, tx, ty, opt);
        break;
      case 'nova':
        doNova(game, p.x, p.y, def.radius, opt);
        break;
      case 'blast':
        doBlast(game, tx, ty, opt);
        break;
      case 'buff':
      case 'heal':
        break;
      default:
        break;
    }

    // 自身增益部分（很多攻击技也带护盾，所以独立于 kind 判断）
    if (def.shield) {
      C.addBuff(p, { kind: 'shield', ms: def.shieldMs || 8000, value: Math.floor(p.stats.hp * def.shield) });
      visual(game, { kind: 'ring', x: p.x, y: p.y, r: 44, ms: 500, color: '#9fd8ff', follow: true });
    }
    if (def.buffAtk) {
      C.addBuff(p, { kind: 'atkUp', ms: def.buffMs || 8000, amount: def.buffAtk });
      ZX.Player.recompute(p);
    }
    if (def.buffDef) {
      C.addBuff(p, { kind: 'defUp', ms: def.buffMs || 8000, amount: def.buffDef });
      ZX.Player.recompute(p);
    }
    if (def.heal) {
      var amount = Math.floor(p.stats.hp * def.heal) + (def.healFlat || 0);
      var got = Math.min(amount, p.stats.hp - p.hp);
      p.hp += got;
      game.hooks.floater(p.x, p.y - 34, got, 'heal');
      visual(game, { kind: 'ring', x: p.x, y: p.y, r: 40, ms: 520, color: '#8ef0b0', follow: true });
      game.hooks.sfx('heal');
    }

    game.hooks.onCast(def);
    return { ok: true };
  }

  /**
   * 法宝主动技。和门派技能共用冷却表，key 用 'talisman'。
   */
  function castTalisman(game, tx, ty) {
    var p = game.player;
    var item = ZX.Inventory.talisman(p.equip);
    if (!item || !item.active) return { ok: false, msg: '没有装备法宝。' };
    if (p.dead) return { ok: false, msg: '你已经倒下了。' };
    var a = item.active;
    if ((p.cd.talisman || 0) > 0) {
      return { ok: false, msg: item.name + ' 尚未凝聚（' + (p.cd.talisman / 1000).toFixed(1) + ' 秒）' };
    }
    p.cd.talisman = a.cd;

    switch (a.kind) {
      case 'heal': {
        var amount = Math.floor(p.stats.hp * (a.heal || 0)) + (a.healFlat || 0);
        var got = Math.min(amount, p.stats.hp - p.hp);
        p.hp += got;
        game.hooks.floater(p.x, p.y - 34, got, 'heal');
        visual(game, { kind: 'ring', x: p.x, y: p.y, r: 46, ms: 600, color: '#8ef0b0', follow: true });
        game.hooks.sfx('heal');
        break;
      }
      case 'nova':
        doNova(game, p.x, p.y, a.radius, {
          dmg: 'magic', power: a.power, burn: a.burn, burnMs: a.burnMs, color: '#ff9a4a',
        });
        break;
      case 'stun': {
        var list = W.inRadius(game.world, p.x, p.y, a.radius);
        for (var i = 0; i < list.length; i++) C.addBuff(list[i], { kind: 'stun', ms: a.ms });
        visual(game, { kind: 'nova', x: p.x, y: p.y, r: a.radius, ms: 420, color: '#b48ff0' });
        game.hooks.sfx('nova');
        break;
      }
      case 'charm': {
        var cl = W.inRadius(game.world, p.x, p.y, a.radius);
        for (var j = 0; j < cl.length; j++) C.addBuff(cl[j], { kind: 'charm', ms: a.ms });
        visual(game, { kind: 'nova', x: p.x, y: p.y, r: a.radius, ms: 420, color: '#f0a0c8' });
        game.hooks.sfx('bell');
        break;
      }
      case 'poison': {
        var pl = W.inRadius(game.world, p.x, p.y, a.radius);
        for (var k = 0; k < pl.length; k++) {
          C.addBuff(pl[k], { kind: 'poison', ms: a.ms, dps: p.stats.atk * a.power });
        }
        visual(game, { kind: 'nova', x: p.x, y: p.y, r: a.radius, ms: 520, color: '#8fc44a' });
        game.hooks.sfx('nova');
        break;
      }
      case 'lifesteal':
        C.addBuff(p, { kind: 'lifesteal', ms: a.ms, amount: a.amount });
        ZX.Player.recompute(p);
        visual(game, { kind: 'ring', x: p.x, y: p.y, r: 42, ms: 600, color: '#e05a6e', follow: true });
        break;
      case 'reflect':
        C.addBuff(p, { kind: 'reflect', ms: a.ms, amount: a.ratio });
        visual(game, { kind: 'ring', x: p.x, y: p.y, r: 46, ms: 600, color: '#9ae0ff', follow: true });
        break;
      case 'shield':
        C.addBuff(p, { kind: 'shield', ms: a.ms, value: Math.floor(p.stats.hp * a.shield) });
        visual(game, { kind: 'ring', x: p.x, y: p.y, r: 48, ms: 600, color: '#ffd98a', follow: true });
        break;
      default:
        break;
    }

    game.hooks.log('祭出【' + item.name + '】· ' + a.name, 'skill');
    return { ok: true };
  }

  /** 普通攻击：近身扇形，走和技能一样的结算 */
  function basicAttack(game) {
    var p = game.player;
    var target = W.nearest(game.world, p.x, p.y, ZX.CONFIG.MELEE_RANGE + 20);
    if (!target) return false;
    p.facing = U.dirTo(p.x, p.y, target.x, target.y);
    doStrike(game, {
      dmg: 'phys',
      power: 1,
      range: ZX.CONFIG.MELEE_RANGE,
      color: ZX.sect(p.sect).color,
    });
    return true;
  }

  // ── 每帧推进 ────────────────────────────────────────────
  function update(game, dt) {
    var p = game.player;
    var i, k;

    // 冷却
    for (k in p.cd) {
      if (Object.prototype.hasOwnProperty.call(p.cd, k) && p.cd[k] > 0) {
        p.cd[k] = Math.max(0, p.cd[k] - dt);
      }
    }

    // 飞行物
    for (i = game.fx.bolts.length - 1; i >= 0; i--) {
      var b = game.fx.bolts[i];
      var step = b.speed * (dt / 1000);
      b.x += b.dx * step;
      b.y += b.dy * step;
      b.left -= step;

      var done = false;

      // 撞墙就停（blast 停在墙前也照样炸）
      if (W.blocked(game.world, b.x, b.y, 4)) done = true;

      var list = W.inRadius(game.world, b.x, b.y, b.width);
      for (var j = 0; j < list.length; j++) {
        var m = list[j];
        if (b.hit[m.uid]) continue;
        b.hit[m.uid] = true;
        if (b.kind === 'blast') continue; // 落点炸，路上不碰
        applyHit(game, m, b.opt);
        if (b.kind === 'bolt') {
          done = true;
          break;
        }
      }

      if (b.left <= 0) done = true;

      if (done) {
        if (b.kind === 'blast') {
          doNova(game, b.x, b.y, b.opt.radius || 120, b.opt);
        } else {
          visual(game, { kind: 'spark', x: b.x, y: b.y, r: 16, ms: 200, color: b.color });
        }
        game.fx.bolts.splice(i, 1);
      }
    }

    // 特效寿命
    for (i = game.fx.visuals.length - 1; i >= 0; i--) {
      var v = game.fx.visuals[i];
      v.life -= dt;
      if (v.follow) {
        v.x = p.x;
        v.y = p.y;
      }
      if (v.life <= 0) game.fx.visuals.splice(i, 1);
    }
  }

  ZX.Skills = {
    newFx: newFx,
    cast: cast,
    castTalisman: castTalisman,
    basicAttack: basicAttack,
    applyHit: applyHit,
    update: update,
    visual: visual,
  };
})(window);
