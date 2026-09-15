/**
 * 活物的画法：玩家、怪物、NPC、掉落物。
 *
 * 视角是俯视偏 3/4：影子在脚下、脸朝屏幕、身体随移动方向左右翻。
 * 每种怪物一个画法函数，按 monsters.js 里的 art 字段分发。
 * 所有形体都用同一套图元（椭圆 + 折线 + 墨线描边），保证画风统一。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var A = ZX.Art;

  var INK = '#12141a';

  function ink(ctx, w) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w || 2;
    ctx.stroke();
  }

  /** 受击白闪：整体压一层白 */
  function flash(ctx, on) {
    if (!on) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
  }

  function unflash(ctx) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ── 玩家 ────────────────────────────────────────────────
  /**
   * t 是总时长（毫秒），用来做走路摆动。
   * moving 决定要不要摆腿，facing 决定朝左还是朝右。
   */
  function player(ctx, p, t, moving) {
    var sect = ZX.sect(p.sect);
    var bob = moving ? Math.sin(t / 110) * 2 : Math.sin(t / 520) * 0.8;
    var flip = p.facing.x < -0.2 ? -1 : 1;

    ctx.save();
    ctx.translate(p.x, p.y);
    A.shadow(ctx, 0, 6, 13, 5);
    ctx.scale(flip, 1);
    ctx.translate(0, bob);

    // 腿
    var swing = moving ? Math.sin(t / 100) * 4 : 0;
    ctx.strokeStyle = '#2a2a32';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-3, 0); ctx.lineTo(-3 - swing, 8);
    ctx.moveTo(3, 0); ctx.lineTo(3 + swing, 8);
    ctx.stroke();

    // 道袍
    ctx.fillStyle = sect.color;
    ctx.beginPath();
    ctx.moveTo(-9, 2);
    ctx.lineTo(-7, -16);
    ctx.quadraticCurveTo(0, -20, 7, -16);
    ctx.lineTo(9, 2);
    ctx.closePath();
    ctx.fill();
    ink(ctx, 1.8);

    // 腰带
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-8, -7, 16, 3);

    // 头
    ctx.fillStyle = '#e8cfae';
    A.blob(ctx, 0, -24, 7, 7.5);
    ink(ctx, 1.6);

    // 发
    ctx.fillStyle = '#1b1b22';
    ctx.beginPath();
    ctx.arc(0, -26, 7.4, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-7, -25);
    ctx.quadraticCurveTo(-10, -12, -5, -10);
    ctx.quadraticCurveTo(-6, -20, -4, -24);
    ctx.fill();

    // 兵器：按装备的槽位类型换个形状，让换装看得出来
    var weapon = ZX.ITEMS.byId(p.equip.weapon);
    drawWeapon(ctx, weapon, sect.color);

    ctx.restore();
  }

  function drawWeapon(ctx, weapon, color) {
    if (!weapon) return;
    var q = ZX.QUALITY[weapon.q].color;
    ctx.save();
    ctx.translate(10, -10);
    ctx.rotate(-0.35);

    var n = weapon.name;
    if (n.indexOf('棍') >= 0 || n.indexOf('杖') >= 0 || n.indexOf('杵') >= 0 || n.indexOf('棒') >= 0) {
      ctx.strokeStyle = weapon.q === 'legend' ? q : '#3a2e22';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 12); ctx.lineTo(0, -22);
      ctx.stroke();
      if (weapon.q !== 'common') {
        ctx.fillStyle = q;
        A.blob(ctx, 0, -24, 4, 4);
      }
    } else if (n.indexOf('罄') >= 0 || n.indexOf('环') >= 0 || n.indexOf('笛') >= 0) {
      ctx.strokeStyle = q;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -6, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (n.indexOf('刃') >= 0 || n.indexOf('爪') >= 0) {
      ctx.strokeStyle = q;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-4, 8); ctx.lineTo(4, -14);
      ctx.moveTo(4, 8); ctx.lineTo(-2, -12);
      ctx.stroke();
    } else {
      // 剑
      ctx.strokeStyle = q;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 10); ctx.lineTo(0, -24);
      ctx.stroke();
      ctx.strokeStyle = '#6b5a45';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-5, 4); ctx.lineTo(5, 4);
      ctx.stroke();
      if (weapon.q === 'epic' || weapon.q === 'legend') {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = q;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(0, 8); ctx.lineTo(0, -22);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // ── 怪物 ────────────────────────────────────────────────
  function monster(ctx, m, t) {
    var def = m.def;
    var r = def.radius;
    var hurt = m.flash > 0;
    var wob = Math.sin(t / 240 + m.uid) * 1.6;

    ctx.save();
    ctx.translate(m.x, m.y + wob);
    A.shadow(ctx, 0, r * 0.55, r * 0.8, r * 0.32);

    if (m.isBoss) {
      // Boss 脚下一圈威压
      ctx.strokeStyle = def.color;
      ctx.globalAlpha = 0.35 + Math.sin(t / 300) * 0.12;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, r * 0.5, r * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    flash(ctx, hurt);
    var fn = SHAPES[def.art] || SHAPES.beast;
    fn(ctx, r, def.color, t, m);
    unflash(ctx);

    // 状态：定身/魅惑/灼烧各给一个记号
    var C = ZX.Combat;
    if (C.hasBuff(m, 'stun')) mark(ctx, -r - 6, '#c8a0f0', '✦');
    else if (C.hasBuff(m, 'charm')) mark(ctx, -r - 6, '#f0a0c8', '♥');
    if (C.hasBuff(m, 'burn')) ember(ctx, r, t);
    if (C.hasBuff(m, 'poison')) {
      ctx.fillStyle = 'rgba(140,200,80,0.25)';
      A.blob(ctx, 0, 0, r, r);
    }

    ctx.restore();
  }

  function mark(ctx, y, color, ch) {
    ctx.fillStyle = color;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ch, 0, y);
  }

  function ember(ctx, r, t) {
    ctx.fillStyle = '#ff8a3a';
    for (var i = 0; i < 3; i++) {
      var ph = (t / 400 + i * 0.6) % 1;
      ctx.globalAlpha = 0.7 * (1 - ph);
      A.blob(ctx, Math.sin(i * 2 + t / 300) * r * 0.5, r * 0.4 - ph * r * 1.6, 2.5, 3.5);
    }
    ctx.globalAlpha = 1;
  }

  var SHAPES = {
    beast: function (ctx, r, color, t) {
      ctx.fillStyle = color;
      A.blob(ctx, 0, 0, r, r * 0.72);       // 身
      ink(ctx, 1.8);
      A.blob(ctx, -r * 0.8, -r * 0.35, r * 0.48, r * 0.42); // 头
      ink(ctx, 1.6);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r * 0.85, -r * 0.2);
      ctx.quadraticCurveTo(r * 1.4, -r * 0.6 + Math.sin(t / 200) * 3, r * 1.2, -r * 0.9);
      ctx.stroke();
      ctx.fillStyle = '#ffdd66';                                  // 眼
      A.blob(ctx, -r * 0.95, -r * 0.42, 2, 2);
    },

    snake: function (ctx, r, color, t) {
      ctx.strokeStyle = color;
      ctx.lineWidth = r * 0.62;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.4);
      for (var i = 1; i <= 4; i++) {
        var px = -r + (i / 4) * r * 1.9;
        var py = r * 0.4 - i * r * 0.22 + Math.sin(t / 180 + i) * 3;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      A.blob(ctx, r * 0.9, -r * 0.5, r * 0.42, r * 0.34);
      ink(ctx, 1.5);
      ctx.fillStyle = '#ff5a5a';
      A.blob(ctx, r * 1.05, -r * 0.55, 1.8, 1.8);
    },

    bat: function (ctx, r, color, t) {
      var flapY = Math.sin(t / 110) * r * 0.35;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-r * 1.3, -r * 0.6 - flapY, -r * 1.7, r * 0.2);
      ctx.quadraticCurveTo(-r * 0.9, r * 0.1, 0, r * 0.4);
      ctx.quadraticCurveTo(r * 0.9, r * 0.1, r * 1.7, r * 0.2);
      ctx.quadraticCurveTo(r * 1.3, -r * 0.6 - flapY, 0, 0);
      ctx.fill();
      ink(ctx, 1.5);
      ctx.fillStyle = '#2a1a1a';
      A.blob(ctx, 0, 0, r * 0.42, r * 0.5);
      ctx.fillStyle = '#ff6a6a';
      A.blob(ctx, -r * 0.16, -r * 0.1, 1.6, 1.6);
      A.blob(ctx, r * 0.16, -r * 0.1, 1.6, 1.6);
    },

    bird: function (ctx, r, color, t) {
      var flap = Math.sin(t / 130) * r * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-r, -r - flap, -r * 1.6, -r * 0.2);
      ctx.quadraticCurveTo(-r * 0.6, r * 0.3, 0, r * 0.5);
      ctx.quadraticCurveTo(r * 0.6, r * 0.3, r * 1.6, -r * 0.2);
      ctx.quadraticCurveTo(r, -r - flap, 0, 0);
      ctx.fill();
      ctx.fillStyle = A.shade(color, 40);
      A.blob(ctx, 0, -r * 0.3, r * 0.34, r * 0.4);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.4);
      ctx.lineTo(Math.sin(t / 200) * 6, r * 1.3);
      ctx.stroke();
    },

    ghost: function (ctx, r, color, t) {
      var sway = Math.sin(t / 300) * 2;
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.5);
      ctx.quadraticCurveTo(-r * 1.05, -r * 1.2, 0 + sway, -r * 1.25);
      ctx.quadraticCurveTo(r * 1.05, -r * 1.2, r, r * 0.5);
      ctx.quadraticCurveTo(r * 0.5, r * 0.15, 0, r * 0.55);
      ctx.quadraticCurveTo(-r * 0.5, r * 0.15, -r, r * 0.5);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#101018';
      A.blob(ctx, -r * 0.3 + sway * 0.4, -r * 0.6, 2.4, 3.4);
      A.blob(ctx, r * 0.3 + sway * 0.4, -r * 0.6, 2.4, 3.4);
    },

    skeleton: function (ctx, r, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.5); ctx.lineTo(0, -r * 0.3);
      ctx.moveTo(-r * 0.6, -r * 0.1); ctx.lineTo(r * 0.6, -r * 0.1);
      ctx.moveTo(0, r * 0.5); ctx.lineTo(-r * 0.4, r);
      ctx.moveTo(0, r * 0.5); ctx.lineTo(r * 0.4, r);
      ctx.stroke();
      ctx.fillStyle = color;
      A.blob(ctx, 0, -r * 0.7, r * 0.42, r * 0.45);
      ink(ctx, 1.4);
      ctx.fillStyle = '#20242c';
      A.blob(ctx, -r * 0.16, -r * 0.74, 1.8, 2.2);
      A.blob(ctx, r * 0.16, -r * 0.74, 1.8, 2.2);
    },

    humanoid: function (ctx, r, color, t, m) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, r * 0.7);
      ctx.lineTo(-r * 0.5, -r * 0.5);
      ctx.quadraticCurveTo(0, -r * 0.75, r * 0.5, -r * 0.5);
      ctx.lineTo(r * 0.7, r * 0.7);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.8);
      ctx.fillStyle = '#e0c8a8';
      A.blob(ctx, 0, -r * 0.85, r * 0.36, r * 0.4);
      ink(ctx, 1.4);
      ctx.fillStyle = '#1b1b22';
      ctx.beginPath();
      ctx.arc(0, -r * 0.95, r * 0.38, Math.PI, Math.PI * 2);
      ctx.fill();
      // 抬手作法时手上亮一点
      if (m && m.castFx > 0) {
        ctx.fillStyle = A.shade(color, 70);
        ctx.globalAlpha = 0.8;
        A.blob(ctx, r * 0.8, -r * 0.3, 5, 5);
        ctx.globalAlpha = 1;
      }
    },

    insect: function (ctx, r, color, t) {
      ctx.fillStyle = color;
      for (var i = 0; i < 3; i++) {
        A.blob(ctx, -r * 0.6 + i * r * 0.6, Math.sin(t / 150 + i) * 2, r * 0.42, r * 0.36);
      }
      ink(ctx, 1.4);
      ctx.strokeStyle = A.shade(color, -30);
      ctx.lineWidth = 2;
      for (var j = -1; j <= 1; j += 2) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.2, 0);
        ctx.lineTo(-r * 0.6, j * r * 0.8);
        ctx.moveTo(r * 0.4, 0);
        ctx.lineTo(r * 0.8, j * r * 0.8);
        ctx.stroke();
      }
    },

    plant: function (ctx, r, color, t) {
      ctx.strokeStyle = A.shade(color, -20);
      ctx.lineWidth = r * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.7);
      ctx.quadraticCurveTo(Math.sin(t / 400) * 4, 0, 0, -r * 0.7);
      ctx.stroke();
      ctx.fillStyle = color;
      for (var i = 0; i < 4; i++) {
        var a = (i / 4) * Math.PI * 2 + t / 900;
        A.blob(ctx, Math.cos(a) * r * 0.7, -r * 0.5 + Math.sin(a) * r * 0.35, r * 0.4, r * 0.22);
      }
      ctx.fillStyle = '#ffe08a';
      A.blob(ctx, 0, -r * 0.5, r * 0.22, r * 0.22);
    },

    golem: function (ctx, r, color, t) {
      ctx.fillStyle = color;
      ctx.fillRect(-r * 0.7, -r * 0.8, r * 1.4, r * 1.5);
      ink(ctx, 2);
      ctx.fillStyle = A.shade(color, -22);
      ctx.fillRect(-r * 1.05, -r * 0.5, r * 0.34, r * 0.9);
      ctx.fillRect(r * 0.7, -r * 0.5, r * 0.34, r * 0.9);
      ctx.fillStyle = '#ff8a4a';
      var glow = 0.6 + Math.sin(t / 260) * 0.3;
      ctx.globalAlpha = glow;
      A.blob(ctx, -r * 0.24, -r * 0.4, 2.4, 2.4);
      A.blob(ctx, r * 0.24, -r * 0.4, 2.4, 2.4);
      ctx.globalAlpha = 1;
    },

    fox: function (ctx, r, color, t) {
      ctx.fillStyle = color;
      A.blob(ctx, 0, 0, r * 0.95, r * 0.6);
      ink(ctx, 1.6);
      // 尾巴：多条，越高级越多
      ctx.strokeStyle = color;
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = 'round';
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(r * 0.8, 0);
        ctx.quadraticCurveTo(
          r * 1.5, i * r * 0.28 + Math.sin(t / 260 + i) * 3,
          r * 1.75, i * r * 0.5 - r * 0.2
        );
        ctx.stroke();
      }
      ctx.fillStyle = color;
      A.blob(ctx, -r * 0.8, -r * 0.3, r * 0.42, r * 0.36);
      ctx.fillStyle = A.shade(color, -40);
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, -r * 0.55); ctx.lineTo(-r * 0.86, -r * 0.95); ctx.lineTo(-r * 0.68, -r * 0.55);
      ctx.moveTo(-r * 0.6, -r * 0.55); ctx.lineTo(-r * 0.46, -r * 0.92); ctx.lineTo(-r * 0.3, -r * 0.5);
      ctx.fill();
      ctx.fillStyle = '#ffdd66';
      A.blob(ctx, -r * 0.92, -r * 0.34, 2, 2);
    },

    zombie: function (ctx, r, color, t) {
      var lean = Math.sin(t / 420) * 0.12;
      ctx.rotate(lean);
      ctx.fillStyle = color;
      ctx.fillRect(-r * 0.55, -r * 0.6, r * 1.1, r * 1.35);
      ink(ctx, 1.8);
      ctx.fillStyle = A.shade(color, 30);
      A.blob(ctx, 0, -r * 0.85, r * 0.38, r * 0.4);
      ink(ctx, 1.4);
      ctx.strokeStyle = A.shade(color, -30);
      ctx.lineWidth = r * 0.24;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.3); ctx.lineTo(-r * 1.1, -r * 0.5);
      ctx.moveTo(r * 0.5, -r * 0.3); ctx.lineTo(r * 1.1, -r * 0.45);
      ctx.stroke();
      ctx.fillStyle = '#c04040';
      A.blob(ctx, -r * 0.14, -r * 0.88, 1.8, 1.8);
      A.blob(ctx, r * 0.14, -r * 0.88, 1.8, 1.8);
    },
  };

  // ── NPC ─────────────────────────────────────────────────
  function npc(ctx, n, t, hasQuest) {
    ctx.save();
    ctx.translate(n.x, n.y);
    A.shadow(ctx, 0, 6, 12, 4.5);

    ctx.fillStyle = n.def.color;
    ctx.beginPath();
    ctx.moveTo(-9, 4);
    ctx.lineTo(-7, -14);
    ctx.quadraticCurveTo(0, -18, 7, -14);
    ctx.lineTo(9, 4);
    ctx.closePath();
    ctx.fill();
    ink(ctx, 1.8);

    ctx.fillStyle = '#e8cfae';
    A.blob(ctx, 0, -22, 6.5, 7);
    ink(ctx, 1.5);
    ctx.fillStyle = '#20202a';
    ctx.beginPath();
    ctx.arc(0, -24, 6.8, Math.PI, Math.PI * 2);
    ctx.fill();

    // 头顶标记：金色叹号 = 有任务，银色问号 = 可交任务
    if (hasQuest) {
      var bob = Math.sin(t / 300) * 3;
      ctx.fillStyle = hasQuest === 'turnin' ? '#8ef0b0' : '#ffd24a';
      ctx.font = 'bold 20px serif';
      ctx.textAlign = 'center';
      ctx.fillText(hasQuest === 'turnin' ? '？' : '！', 0, -34 + bob);
    }
    ctx.restore();
  }

  // ── 掉落物 ──────────────────────────────────────────────
  function drop(ctx, d, t) {
    var item = ZX.ITEMS.byId(d.id);
    if (!item) return;
    var color = ZX.QUALITY[item.q].color;
    var bob = Math.sin(t / 300 + d.uid) * 3;
    var fading = d.life < 6000 && Math.floor(t / 220) % 2 === 0;

    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.globalAlpha = fading ? 0.35 : 1;

    A.shadow(ctx, 0, 8, 8, 3);
    ctx.translate(0, bob);

    // 好东西带光柱
    if (item.q === 'epic' || item.q === 'legend') {
      var grad = ctx.createLinearGradient(0, -46, 0, 6);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, color);
      ctx.globalAlpha = (fading ? 0.2 : 0.4) + Math.sin(t / 260) * 0.08;
      ctx.fillStyle = grad;
      ctx.fillRect(-6, -46, 12, 52);
      ctx.globalAlpha = fading ? 0.35 : 1;
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    if (item.type === 'potion') {
      ctx.beginPath();
      ctx.moveTo(-3, -8); ctx.lineTo(3, -8); ctx.lineTo(5, 0);
      ctx.quadraticCurveTo(5, 6, 0, 6);
      ctx.quadraticCurveTo(-5, 6, -5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (item.type === 'material') {
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-6, 5); ctx.lineTo(-4, -7); ctx.lineTo(4, -7); ctx.lineTo(6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── 传送门 ──────────────────────────────────────────────
  function portal(ctx, p, t) {
    ctx.save();
    ctx.translate(p.x, p.y);
    var pulse = 0.6 + Math.sin(t / 380) * 0.2;
    var grad = ctx.createRadialGradient(0, 0, 2, 0, 0, p.r * 1.6);
    grad.addColorStop(0, 'rgba(180,230,255,' + pulse + ')');
    grad.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = grad;
    A.blob(ctx, 0, 0, p.r * 1.6, p.r * 1.1);

    ctx.strokeStyle = 'rgba(200,240,255,0.8)';
    ctx.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      var ph = ((t / 900 + i / 3) % 1);
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * (0.3 + ph), p.r * (0.2 + ph * 0.7), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ZX.Actors = {
    player: player,
    monster: monster,
    npc: npc,
    drop: drop,
    portal: portal,
    SHAPES: SHAPES,
  };
})(window);
