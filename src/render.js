/**
 * 渲染：摄像机、绘制顺序、法术特效、血条与飘字。
 *
 * 绘制顺序就是遮挡关系：地面 → 装饰 → 掉落 → 传送门 → 障碍
 *   → 活物（按 y 排序，站得靠下的画在上面）→ 特效 → 血条飘字。
 * 只画视口里的东西，地图再大也不掉帧。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var CFG = ZX.CONFIG;
  var U = ZX.U;
  var A = ZX.Art;

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
    this.floaters = [];
    this.dpr = 1;
    this.resize();
  }

  Renderer.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = this.canvas.clientWidth || global.innerWidth;
    var h = this.canvas.clientHeight || global.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.dpr = dpr;
    this.vw = w;
    this.vh = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /** 飘字：伤害、治疗、经验 */
  Renderer.prototype.floater = function (x, y, text, kind) {
    this.floaters.push({
      x: x, y: y,
      text: text,
      kind: kind || 'hit',
      life: CFG.FLOAT_MS,
      vx: U.rand(-14, 14),
    });
    // 一屏最多留这么多，刷怪爆发时不至于糊屏
    if (this.floaters.length > 70) this.floaters.splice(0, this.floaters.length - 70);
  };

  Renderer.prototype.updateFloaters = function (dt) {
    for (var i = this.floaters.length - 1; i >= 0; i--) {
      var f = this.floaters[i];
      f.life -= dt;
      f.y -= dt * 0.035;
      f.x += f.vx * (dt / 1000);
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  };

  /** 摄像机跟随，并钳在地图内；地图比屏幕小就居中 */
  Renderer.prototype.follow = function (world, px, py, instant) {
    var c = this.cam;
    c.w = this.vw;
    c.h = this.vh;

    var tx = px - c.w / 2;
    var ty = py - c.h / 2;

    tx = world.w <= c.w ? (world.w - c.w) / 2 : U.clamp(tx, 0, world.w - c.w);
    ty = world.h <= c.h ? (world.h - c.h) / 2 : U.clamp(ty, 0, world.h - c.h);

    if (instant) {
      c.x = tx;
      c.y = ty;
    } else {
      c.x = U.lerp(c.x, tx, CFG.CAM_LERP);
      c.y = U.lerp(c.y, ty, CFG.CAM_LERP);
    }
  };

  Renderer.prototype.screenToWorld = function (sx, sy) {
    return { x: sx + this.cam.x, y: sy + this.cam.y };
  };

  Renderer.prototype.draw = function (game, t) {
    var ctx = this.ctx;
    var world = game.world;
    var p = game.player;
    var cam = this.cam;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.vw, this.vh);

    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));

    A.ground(ctx, world, cam);
    A.decor(ctx, world, cam);

    var i;
    for (i = 0; i < world.drops.length; i++) {
      if (!inView(cam, world.drops[i].x, world.drops[i].y, 40)) continue;
      ZX.Actors.drop(ctx, world.drops[i], t);
    }

    for (i = 0; i < world.portals.length; i++) {
      if (!inView(cam, world.portals[i].x, world.portals[i].y, 80)) continue;
      ZX.Actors.portal(ctx, world.portals[i], t);
    }

    A.blocks(ctx, world);

    // 活物按 y 排序，形成前后遮挡
    var actors = [];
    for (i = 0; i < world.npcs.length; i++) {
      var n = world.npcs[i];
      if (inView(cam, n.x, n.y, 60)) actors.push({ y: n.y, kind: 'npc', ref: n });
    }
    for (i = 0; i < world.monsters.length; i++) {
      var m = world.monsters[i];
      if (m.dead) continue;
      if (inView(cam, m.x, m.y, 80)) actors.push({ y: m.y, kind: 'monster', ref: m });
    }
    if (!p.dead) actors.push({ y: p.y, kind: 'player', ref: p });

    actors.sort(function (a, b) {
      return a.y - b.y;
    });

    for (i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (a.kind === 'monster') ZX.Actors.monster(ctx, a.ref, t);
      else if (a.kind === 'npc') {
        var mark = questMark(game, a.ref.def.key);
        ZX.Actors.npc(ctx, a.ref, t, mark);
      } else {
        ZX.Actors.player(ctx, p, t, game.moving);
        drawPlayerAura(ctx, p, t);
      }
    }

    drawBolts(ctx, game);
    drawVisuals(ctx, game);

    // 血条画在所有活物之上，免得被挡住
    for (i = 0; i < world.monsters.length; i++) {
      var mm = world.monsters[i];
      if (mm.dead || !inView(cam, mm.x, mm.y, 80)) continue;
      drawMonsterBar(ctx, mm, p);
    }

    drawFloaters(ctx, this.floaters);
    ctx.restore();
  };

  function inView(cam, x, y, pad) {
    return x > cam.x - pad && x < cam.x + cam.w + pad && y > cam.y - pad && y < cam.y + cam.h + pad;
  }

  function questMark(game, npcKey) {
    var p = game.player;
    if (ZX.Quest.canTurnInAt(p, npcKey)) return 'turnin';
    if (ZX.Quest.isGiver(p, npcKey)) return 'give';
    return null;
  }

  /** 玩家身上的增益光效 */
  function drawPlayerAura(ctx, p, t) {
    var C = ZX.Combat;
    var shield = C.getBuff(p, 'shield');
    if (shield && shield.value > 0) {
      ctx.strokeStyle = 'rgba(160,220,255,' + (0.5 + Math.sin(t / 220) * 0.2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 8, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (C.hasBuff(p, 'atkUp')) {
      ctx.fillStyle = 'rgba(224,90,110,0.5)';
      for (var i = 0; i < 4; i++) {
        var ph = (t / 600 + i / 4) % 1;
        A.blob(ctx, p.x + Math.sin(i * 2 + t / 400) * 14, p.y + 6 - ph * 34, 2.5, 3.5);
      }
    }
    if (C.hasBuff(p, 'reflect')) {
      ctx.strokeStyle = 'rgba(150,220,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        var a1 = (k / 6) * Math.PI * 2 + t / 900;
        ctx.moveTo(p.x + Math.cos(a1) * 26, p.y - 8 + Math.sin(a1) * 26);
        ctx.lineTo(p.x + Math.cos(a1 + 1.05) * 26, p.y - 8 + Math.sin(a1 + 1.05) * 26);
      }
      ctx.stroke();
    }
  }

  function drawBolts(ctx, game) {
    var list = game.fx.bolts;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var color = b.color || '#9fd8ff';
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.dy, b.dx));

      if (b.kind === 'pierce') {
        var grad = ctx.createLinearGradient(-60, 0, 10, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fillRect(-60, -b.width / 2, 70, b.width);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-14, -2, 24, 4);
      } else {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.35;
        A.blob(ctx, -10, 0, 16, 7);
        ctx.globalAlpha = 1;
        A.blob(ctx, 0, 0, 7, 6);
        ctx.fillStyle = '#ffffff';
        A.blob(ctx, 1, -1, 3, 2.5);
      }
      ctx.restore();
    }
  }

  function drawVisuals(ctx, game) {
    var list = game.fx.visuals;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var k = 1 - v.life / v.ms; // 0→1 的进度
      ctx.save();
      ctx.translate(v.x, v.y);

      if (v.kind === 'nova') {
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.strokeStyle = v.color || '#9fd8ff';
        ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(0, 0, v.r * (0.25 + k * 0.85), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.22;
        ctx.fillStyle = v.color || '#9fd8ff';
        ctx.beginPath();
        ctx.arc(0, 0, v.r * (0.25 + k * 0.85), 0, Math.PI * 2);
        ctx.fill();
      } else if (v.kind === 'slash') {
        ctx.rotate(Math.atan2(v.ay, v.ax));
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = v.color || '#ffffff';
        ctx.lineWidth = 5 * (1 - k) + 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, v.r * 0.8, -0.85 + k * 0.5, 0.85 + k * 0.5);
        ctx.stroke();
      } else if (v.kind === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = v.color || '#9fd8ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -8, v.r * (0.4 + k * 0.8), 0, Math.PI * 2);
        ctx.stroke();
      } else if (v.kind === 'spark') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = v.color || '#ffffff';
        for (var s = 0; s < 6; s++) {
          var a = (s / 6) * Math.PI * 2;
          A.blob(ctx, Math.cos(a) * v.r * k, Math.sin(a) * v.r * k, 2.5 * (1 - k) + 0.6, 2.5 * (1 - k) + 0.6);
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawMonsterBar(ctx, m, player) {
    var def = m.def;
    var full = m.hp >= m.maxHp;
    // 满血的杂鱼不显示血条，画面干净；精英和 Boss 始终显示
    if (full && !def.isElite) return;

    var w = def.isBoss ? 64 : def.isElite ? 46 : 34;
    var y = m.y - def.radius - 16;
    var ratio = U.clamp(m.hp / m.maxHp, 0, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(m.x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = def.isBoss ? '#e05a6e' : def.isElite ? '#e0a04a' : '#7fc46a';
    ctx.fillRect(m.x - w / 2, y, w * ratio, 4);

    // 等级差超过 5 级就标个颜色，提醒别越级送
    var gap = def.lv - player.level;
    if (def.isElite || gap >= 5) {
      ctx.fillStyle = gap >= 8 ? '#ff6a6a' : gap >= 4 ? '#ffb84a' : '#c8d0dc';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((def.isBoss ? '◆ ' : '') + 'Lv' + def.lv + ' ' + def.name, m.x, y - 4);
    }
  }

  var FLOAT_STYLE = {
    hit: { color: '#ffffff', size: 14 },
    crit: { color: '#ffd24a', size: 19 },
    hurt: { color: '#ff6a6a', size: 15 },
    heal: { color: '#8ef0b0', size: 14 },
    exp: { color: '#9fd8ff', size: 13 },
    miss: { color: '#c8d0dc', size: 13 },
    gold: { color: '#f0c860', size: 13 },
  };

  function drawFloaters(ctx, list) {
    ctx.textAlign = 'center';
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var st = FLOAT_STYLE[f.kind] || FLOAT_STYLE.hit;
      var k = f.life / CFG.FLOAT_MS;
      ctx.globalAlpha = U.clamp(k * 1.6, 0, 1);
      ctx.font = 'bold ' + st.size + 'px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      var text = typeof f.text === 'number' ? String(f.text) : f.text;
      if (f.kind === 'crit') text = text + '!';
      ctx.strokeText(text, f.x, f.y);
      ctx.fillStyle = st.color;
      ctx.fillText(text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  ZX.Renderer = Renderer;
})(window);
