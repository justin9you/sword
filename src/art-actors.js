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

  var SWING_MS = ZX.CONFIG.SWING_MS;

  /**
   * 挥砍的时间曲线：0→1。
   * 前 30% 慢（抬手蓄势），中间猛地抡过去，末尾稍微回一点。
   * 匀速转过去会像在搅拌，没有"砍"的感觉。
   */
  function swingLean(k) {
    if (k < 0.3) return (k / 0.3) * 0.18;                 // 抬手
    if (k < 0.55) return 0.18 + ((k - 0.3) / 0.25) * 0.92; // 劈下
    return 1.1 - ((k - 0.55) / 0.45) * 0.28;              // 收势
  }

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

    // 出手进度 0→1。前三成是抬手蓄势，后面是抡下去，收尾回位。
    // 只画一道剑气弧线、人却站着不动的话，打击感是空的
    var k = p.swingMs > 0 ? 1 - p.swingMs / SWING_MS : -1;

    ctx.save();
    ctx.translate(p.x, p.y);
    A.shadow(ctx, 0, 6, 13, 5);
    ctx.scale(flip, 1);
    ctx.translate(0, bob);

    // 挥砍时整个人朝出手方向前倾、并往前送一点
    if (k >= 0) {
      var lunge = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 5;
      ctx.translate(lunge, 0);
      ctx.rotate(swingLean(k) * 0.16);
    }

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
    drawWeapon(ctx, weapon, sect.color, k);

    ctx.restore();
  }

  function drawWeapon(ctx, weapon, color, k) {
    if (!weapon) return;
    var q = ZX.QUALITY[weapon.q].color;
    ctx.save();
    ctx.translate(10, -10);
    // 静止时斜握；出手时从后举一路抡到身前
    ctx.rotate(k >= 0 ? -1.15 + swingLean(k) * 2.2 : -0.35);

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

  /**
   * 头顶在哪（单位是 r）。
   * 角、冠、面具这类特征得长在脸上，而每种体型的头不在同一处——
   * 四足兽的头偏左，人形在正上方，蜈蚣在右前端。
   * 与其给二十几个 SHAPES 都加参数，不如在这儿列一张表，缺省按人形算。
   */
  var HEAD = {
    beast: [-0.8, -0.5], wolf: [-0.62, -0.72], boar: [-0.85, -0.42],
    deer: [-1.12, -1.28], ape: [0, -1.08], qilin: [-0.92, -0.78],
    snake: [0.9, -0.72], bat: [0, -0.3], bird: [0, -0.5],
    ghost: [0, -0.95], skeleton: [0, -0.85], insect: [-0.6, -0.3],
    plant: [0, -0.75], golem: [0, -0.9], fox: [-0.8, -0.6],
    zombie: [0, -1.0], humanoid: [0, -1.05],
    bandit: [0, -1.0], mage: [0, -1.05], swordsman: [0, -1.1],
    demon: [0, -1.0], guard: [0, -1.05], elder: [-0.3, -0.92],
    bee: [-0.5, -0.4], leech: [-1.06, -0.2], centipede: [1.16, -0.3],
  };

  /**
   * 特征叠加：同体型之间再分个体。
   *
   * 光靠颜色是分不出来的——三只同色系的傀儡站一起，谁是石傀儡谁是玄火卫全靠猜。
   * 这八种记号画在体型之上，跟体型自由组合，成本很低但区分度立竿见影。
   */
  function feature(ctx, r, color, t, def) {
    var f = def.feat;
    if (!f) return;
    var h = HEAD[def.art] || HEAD.humanoid;
    var hx = h[0] * r;
    var hy = h[1] * r;
    var i;

    if (f === 'horn') {                       // 一对尖角
      ctx.strokeStyle = '#efe6d0';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.22, hy);
      ctx.quadraticCurveTo(hx - r * 0.5, hy - r * 0.4, hx - r * 0.3, hy - r * 0.78);
      ctx.moveTo(hx + r * 0.22, hy);
      ctx.quadraticCurveTo(hx + r * 0.5, hy - r * 0.4, hx + r * 0.3, hy - r * 0.78);
      ctx.stroke();
    } else if (f === 'mane') {                // 一圈炸开的鬃
      ctx.strokeStyle = A.shade(color, -40);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (i = 0; i < 9; i++) {
        var a = Math.PI * (0.05 + i * 0.11);
        ctx.moveTo(hx - Math.cos(a) * r * 0.42, hy - Math.sin(a) * r * 0.42);
        ctx.lineTo(hx - Math.cos(a) * r * 0.86, hy - Math.sin(a) * r * 0.86);
      }
      ctx.stroke();
    } else if (f === 'crown') {               // 冠：只给首领和头目
      ctx.fillStyle = '#e8c86a';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.34, hy - r * 0.42);
      ctx.lineTo(hx - r * 0.34, hy - r * 0.72);
      ctx.lineTo(hx - r * 0.17, hy - r * 0.56);
      ctx.lineTo(hx, hy - r * 0.86);
      ctx.lineTo(hx + r * 0.17, hy - r * 0.56);
      ctx.lineTo(hx + r * 0.34, hy - r * 0.72);
      ctx.lineTo(hx + r * 0.34, hy - r * 0.42);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.2);
    } else if (f === 'spike') {               // 背上一排骨刺
      ctx.fillStyle = A.shade(color, -50);
      ctx.beginPath();
      for (i = -2; i <= 2; i++) {
        var sx = i * r * 0.34;
        ctx.moveTo(sx - r * 0.12, -r * 0.5);
        ctx.lineTo(sx, -r * 0.5 - r * (0.5 - Math.abs(i) * 0.09));
        ctx.lineTo(sx + r * 0.12, -r * 0.5);
      }
      ctx.fill();
    } else if (f === 'aura') {                // 绕身的灵光
      ctx.fillStyle = A.shade(color, 80);
      for (i = 0; i < 6; i++) {
        var ang = t / 700 + (i / 6) * Math.PI * 2;
        ctx.globalAlpha = 0.3 + Math.sin(t / 300 + i) * 0.22;
        A.blob(ctx, Math.cos(ang) * r * 1.3, Math.sin(ang) * r * 0.5 - r * 0.2, 2.4, 2.4);
      }
      ctx.globalAlpha = 1;
    } else if (f === 'mask') {                // 面具：遮掉五官，反而最好认
      ctx.fillStyle = '#e8e0d0';
      A.blob(ctx, hx, hy + r * 0.2, r * 0.3, r * 0.3);
      ink(ctx, 1.4);
      ctx.fillStyle = '#a03028';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.2, hy + r * 0.12);
      ctx.lineTo(hx - r * 0.04, hy + r * 0.2);
      ctx.lineTo(hx - r * 0.2, hy + r * 0.26);
      ctx.moveTo(hx + r * 0.2, hy + r * 0.12);
      ctx.lineTo(hx + r * 0.04, hy + r * 0.2);
      ctx.lineTo(hx + r * 0.2, hy + r * 0.26);
      ctx.fill();
    } else if (f === 'blade') {               // 悬在身侧的剑
      ctx.strokeStyle = '#cfe0ea';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      var bob = Math.sin(t / 340) * r * 0.12;
      ctx.beginPath();
      ctx.moveTo(r * 1.0, -r * 0.2 + bob);
      ctx.lineTo(r * 1.0, -r * 1.3 + bob);
      ctx.moveTo(r * 0.82, -r * 0.4 + bob);
      ctx.lineTo(r * 1.18, -r * 0.4 + bob);
      ctx.stroke();
    } else if (f === 'stripe') {              // 身上的横斑
      ctx.strokeStyle = A.shade(color, -55);
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      for (i = -2; i <= 2; i++) {
        ctx.moveTo(i * r * 0.36 - r * 0.1, -r * 0.42);
        ctx.lineTo(i * r * 0.36 + r * 0.1, r * 0.34);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
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
    feature(ctx, r, def.color, t, def);
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

    // ══ 兽类细分 ═══════════════════════════════════════════
    // 原来十二只四足怪共用一个 beast，换个颜色就算另一只，打起来根本分不清。
    // 拆成犬、猪、鹿、猿、麒麟五种轮廓，剩下的才继续走通用 beast。

    wolf: function (ctx, r, color, t) {
      ctx.fillStyle = color;
      A.blob(ctx, 0, 0, r, r * 0.58);                 // 身子比通用兽瘦长
      ink(ctx, 1.8);
      ctx.fillStyle = color;
      ctx.beginPath();                                 // 尖吻
      ctx.moveTo(-r * 0.5, -r * 0.18);
      ctx.lineTo(-r * 1.55, -r * 0.36);
      ctx.lineTo(-r * 0.5, -r * 0.74);
      ctx.closePath();
      ctx.fill();
      A.blob(ctx, -r * 0.6, -r * 0.46, r * 0.4, r * 0.38);
      ink(ctx, 1.5);
      ctx.fillStyle = A.shade(color, -34);             // 立耳
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.7); ctx.lineTo(-r * 0.68, -r * 1.26); ctx.lineTo(-r * 0.48, -r * 0.68);
      ctx.moveTo(-r * 0.42, -r * 0.72); ctx.lineTo(-r * 0.28, -r * 1.18); ctx.lineTo(-r * 0.14, -r * 0.64);
      ctx.fill();
      ctx.strokeStyle = color;                         // 尾巴竖着摆
      ctx.lineWidth = r * 0.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 0.85, -r * 0.1);
      ctx.quadraticCurveTo(r * 1.5, -r * 0.5, r * 1.26, -r * 1.05 + Math.sin(t / 220) * 3);
      ctx.stroke();
      ctx.fillStyle = '#ffdd66';
      A.blob(ctx, -r * 0.7, -r * 0.5, 2, 2);
    },

    boar: function (ctx, r, color, t) {
      ctx.fillStyle = color;
      A.blob(ctx, r * 0.1, 0, r * 1.05, r * 0.82);     // 又圆又壮
      ink(ctx, 2);
      ctx.fillStyle = A.shade(color, -18);             // 背上一道硬鬃
      ctx.beginPath();
      for (var i = 0; i <= 5; i++) {
        var bx = -r * 0.5 + i * r * 0.3;
        ctx.moveTo(bx, -r * 0.7);
        ctx.lineTo(bx + r * 0.06, -r * 1.05);
        ctx.lineTo(bx + r * 0.16, -r * 0.66);
      }
      ctx.fill();
      ctx.fillStyle = color;
      A.blob(ctx, -r * 0.85, -r * 0.1, r * 0.46, r * 0.44);
      ink(ctx, 1.6);
      ctx.fillStyle = A.shade(color, -40);             // 拱嘴
      A.blob(ctx, -r * 1.2, r * 0.06, r * 0.22, r * 0.18);
      ctx.strokeStyle = '#efe6d0';                     // 獠牙
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, r * 0.1); ctx.lineTo(-r * 1.3, -r * 0.3);
      ctx.moveTo(-r * 0.92, r * 0.16); ctx.lineTo(-r * 1.08, -r * 0.22);
      ctx.stroke();
      ctx.fillStyle = '#ffdd66';
      A.blob(ctx, -r * 0.92, -r * 0.2, 1.8, 1.8);
      ctx.strokeStyle = A.shade(color, -30);           // 短腿
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, r * 0.7); ctx.lineTo(-r * 0.4, r * 1.0 + Math.sin(t / 170) * 2);
      ctx.moveTo(r * 0.5, r * 0.7); ctx.lineTo(r * 0.5, r * 1.0 - Math.sin(t / 170) * 2);
      ctx.stroke();
    },

    deer: function (ctx, r, color, t) {
      ctx.strokeStyle = A.shade(color, -34);           // 细长腿，先画在身后
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, r * 0.4); ctx.lineTo(-r * 0.46, r * 1.1 + Math.sin(t / 190) * 2);
      ctx.moveTo(r * 0.45, r * 0.4); ctx.lineTo(r * 0.52, r * 1.1 - Math.sin(t / 190) * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      A.blob(ctx, 0, 0, r * 0.92, r * 0.52);
      ink(ctx, 1.6);
      ctx.strokeStyle = color;                         // 昂起的脖子
      ctx.lineWidth = r * 0.28;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.2);
      ctx.quadraticCurveTo(-r * 1.0, -r * 0.7, -r * 1.05, -r * 1.05);
      ctx.stroke();
      ctx.fillStyle = color;
      A.blob(ctx, -r * 1.12, -r * 1.16, r * 0.3, r * 0.24);
      ink(ctx, 1.4);
      ctx.strokeStyle = '#d8c8a8';                     // 鹿角
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-r * 1.2, -r * 1.35); ctx.lineTo(-r * 1.34, -r * 1.95);
      ctx.moveTo(-r * 1.28, -r * 1.62); ctx.lineTo(-r * 1.62, -r * 1.76);
      ctx.moveTo(-r * 0.98, -r * 1.35); ctx.lineTo(-r * 0.9, -r * 1.92);
      ctx.moveTo(-r * 0.94, -r * 1.6); ctx.lineTo(-r * 0.62, -r * 1.78);
      ctx.stroke();
      ctx.fillStyle = '#efe6d0';                       // 白斑
      ctx.globalAlpha = 0.55;
      A.blob(ctx, -r * 0.1, -r * 0.16, 2.2, 2.2);
      A.blob(ctx, r * 0.36, -r * 0.04, 2.2, 2.2);
      A.blob(ctx, r * 0.12, r * 0.16, 2.2, 2.2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2a2018';
      A.blob(ctx, -r * 1.2, -r * 1.18, 1.8, 1.8);
    },

    ape: function (ctx, r, color, t) {
      var sway = Math.sin(t / 300) * 2;
      ctx.strokeStyle = color;                         // 长臂，垂到地上
      ctx.lineWidth = r * 0.26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.45);
      ctx.quadraticCurveTo(-r * 1.2, r * 0.1 + sway, -r * 0.95, r * 0.85);
      ctx.moveTo(r * 0.5, -r * 0.45);
      ctx.quadraticCurveTo(r * 1.2, r * 0.1 - sway, r * 0.95, r * 0.85);
      ctx.stroke();
      ctx.fillStyle = color;                           // 驼背的躯干
      ctx.beginPath();
      ctx.moveTo(-r * 0.62, r * 0.8);
      ctx.quadraticCurveTo(-r * 0.86, -r * 0.5, 0, -r * 0.72);
      ctx.quadraticCurveTo(r * 0.86, -r * 0.5, r * 0.62, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.9);
      ctx.fillStyle = A.shade(color, 26);
      A.blob(ctx, 0, -r * 0.92, r * 0.36, r * 0.34);
      ink(ctx, 1.4);
      ctx.fillStyle = A.shade(color, -26);             // 招风耳
      A.blob(ctx, -r * 0.42, -r * 0.94, r * 0.14, r * 0.16);
      A.blob(ctx, r * 0.42, -r * 0.94, r * 0.14, r * 0.16);
      ctx.fillStyle = '#f0d8b8';                       // 脸盘
      A.blob(ctx, 0, -r * 0.86, r * 0.2, r * 0.22);
      ctx.fillStyle = '#2a1c14';
      A.blob(ctx, -r * 0.1, -r * 0.92, 1.6, 1.8);
      A.blob(ctx, r * 0.1, -r * 0.92, 1.6, 1.8);
    },

    qilin: function (ctx, r, color, t) {
      var glow = 0.5 + Math.sin(t / 240) * 0.2;
      ctx.fillStyle = color;
      A.blob(ctx, 0, 0, r * 1.05, r * 0.66);
      ink(ctx, 2);
      ctx.fillStyle = A.shade(color, -24);             // 鳞片
      ctx.globalAlpha = 0.6;
      for (var i = -1; i <= 2; i++) {
        A.blob(ctx, i * r * 0.36, -r * 0.16, r * 0.17, r * 0.13);
        A.blob(ctx, i * r * 0.36 + r * 0.18, r * 0.12, r * 0.17, r * 0.13);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;                           // 头
      A.blob(ctx, -r * 0.92, -r * 0.5, r * 0.44, r * 0.36);
      ink(ctx, 1.6);
      ctx.strokeStyle = A.shade(color, 55);            // 火焰鬃
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.globalAlpha = glow + 0.3;
      for (var j = 0; j < 4; j++) {
        var hy = -r * 0.75 + j * r * 0.24;
        ctx.beginPath();
        ctx.moveTo(-r * 0.55 + j * r * 0.16, hy);
        ctx.quadraticCurveTo(-r * 0.2 + j * r * 0.16, hy - r * 0.5,
          -r * 0.34 + j * r * 0.16 + Math.sin(t / 200 + j) * 3, hy - r * 0.78);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffe0a0';                     // 独角
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-r * 1.02, -r * 0.78); ctx.lineTo(-r * 1.3, -r * 1.42);
      ctx.stroke();
      ctx.fillStyle = '#ffdd66';
      A.blob(ctx, -r * 1.06, -r * 0.54, 2.2, 2.2);
      ctx.strokeStyle = A.shade(color, 40);            // 拖尾的火
      ctx.lineWidth = r * 0.16;
      ctx.globalAlpha = glow;
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -r * 0.2);
      ctx.quadraticCurveTo(r * 1.7, -r * 0.7, r * 1.4, -r * 1.2 + Math.sin(t / 180) * 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },

    // ══ 人形细分 ═══════════════════════════════════════════
    // 原来十四只人形怪全是同一个剪影：山贼、法师、剑修、魔头、老妖怪一个样。
    // 按"他拿什么、穿什么、什么体态"拆成五种。

    bandit: function (ctx, r, color, t, m) {
      ctx.fillStyle = color;                           // 粗布短打，下摆开衩
      ctx.beginPath();
      ctx.moveTo(-r * 0.66, r * 0.8);
      ctx.lineTo(-r * 0.52, -r * 0.42);
      ctx.quadraticCurveTo(0, -r * 0.66, r * 0.52, -r * 0.42);
      ctx.lineTo(r * 0.66, r * 0.8);
      ctx.lineTo(r * 0.2, r * 0.6);
      ctx.lineTo(0, r * 0.82);
      ctx.lineTo(-r * 0.2, r * 0.6);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.8);
      ctx.fillStyle = '#e0c8a8';
      A.blob(ctx, 0, -r * 0.8, r * 0.34, r * 0.36);
      ink(ctx, 1.4);
      ctx.fillStyle = A.shade(color, -40);             // 包头巾 + 垂下的一角
      ctx.beginPath();
      ctx.arc(0, -r * 0.88, r * 0.36, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.3, -r * 0.92);
      ctx.lineTo(r * 0.72, -r * 0.6 + Math.sin(t / 300) * 2);
      ctx.lineTo(r * 0.3, -r * 0.64);
      ctx.fill();
      ctx.strokeStyle = '#cfd4d8';                     // 砍刀
      ctx.lineWidth = 3;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(r * 0.6, r * 0.1);
      ctx.quadraticCurveTo(r * 1.25, -r * 0.2, r * 1.1, -r * 0.8);
      ctx.stroke();
      if (m && m.castFx > 0) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },

    mage: function (ctx, r, color, t, m) {
      var float = Math.sin(t / 380) * 1.6;
      ctx.translate(0, float);
      ctx.fillStyle = color;                           // 拖地长袍
      ctx.beginPath();
      ctx.moveTo(-r * 0.86, r * 0.9);
      ctx.quadraticCurveTo(-r * 0.4, -r * 0.3, -r * 0.34, -r * 0.62);
      ctx.lineTo(r * 0.34, -r * 0.62);
      ctx.quadraticCurveTo(r * 0.4, -r * 0.3, r * 0.86, r * 0.9);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.8);
      ctx.fillStyle = A.shade(color, -30);             // 兜帽
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, -r * 0.56);
      ctx.quadraticCurveTo(0, -r * 1.34, r * 0.42, -r * 0.56);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.4);
      ctx.fillStyle = '#080810';                       // 帽子底下是一片黑
      A.blob(ctx, 0, -r * 0.76, r * 0.24, r * 0.2);
      ctx.fillStyle = m && m.castFx > 0 ? '#fff0a0' : A.shade(color, 80);
      A.blob(ctx, -r * 0.09, -r * 0.78, 1.7, 1.7);
      A.blob(ctx, r * 0.09, -r * 0.78, 1.7, 1.7);
      ctx.strokeStyle = '#7a5a3a';                     // 法杖
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 0.72, r * 0.85); ctx.lineTo(r * 0.82, -r * 1.15);
      ctx.stroke();
      var orb = 0.55 + Math.sin(t / 200) * 0.25 + (m && m.castFx > 0 ? 0.4 : 0);
      ctx.globalAlpha = Math.min(1, orb);
      ctx.fillStyle = A.shade(color, 90);
      A.blob(ctx, r * 0.82, -r * 1.3, r * 0.22, r * 0.22);
      ctx.globalAlpha = 1;
      ctx.translate(0, -float);
    },

    swordsman: function (ctx, r, color, t, m) {
      ctx.fillStyle = color;                           // 道袍：宽袖、束腰
      ctx.beginPath();
      ctx.moveTo(-r * 0.78, r * 0.85);
      ctx.lineTo(-r * 0.36, r * 0.05);
      ctx.lineTo(-r * 0.5, -r * 0.5);
      ctx.quadraticCurveTo(0, -r * 0.74, r * 0.5, -r * 0.5);
      ctx.lineTo(r * 0.36, r * 0.05);
      ctx.lineTo(r * 0.78, r * 0.85);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.8);
      ctx.fillStyle = A.shade(color, 55);              // 前襟
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.2, r * 0.02); ctx.lineTo(0, r * 0.1);
      ctx.lineTo(-r * 0.2, r * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8d2b4';
      A.blob(ctx, 0, -r * 0.84, r * 0.32, r * 0.35);
      ink(ctx, 1.3);
      ctx.fillStyle = '#20202a';                       // 发髻
      ctx.beginPath();
      ctx.arc(0, -r * 0.92, r * 0.34, Math.PI, Math.PI * 2);
      ctx.fill();
      A.blob(ctx, 0, -r * 1.24, r * 0.15, r * 0.16);
      ctx.strokeStyle = '#cfd8e0';                     // 背后的剑
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, r * 0.5); ctx.lineTo(r * 0.55, -r * 1.05);
      ctx.stroke();
      if (m && m.castFx > 0) {                         // 出招时剑上起一层光
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = A.shade(color, 90);
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },

    demon: function (ctx, r, color, t, m) {
      ctx.fillStyle = color;                           // 宽肩、收腰，比人形更横
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, r * 0.85);
      ctx.lineTo(-r * 0.4, -r * 0.1);
      ctx.lineTo(-r * 0.95, -r * 0.5);
      ctx.lineTo(-r * 0.45, -r * 0.66);
      ctx.quadraticCurveTo(0, -r * 0.86, r * 0.45, -r * 0.66);
      ctx.lineTo(r * 0.95, -r * 0.5);
      ctx.lineTo(r * 0.4, -r * 0.1);
      ctx.lineTo(r * 0.5, r * 0.85);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 2);
      ctx.fillStyle = A.shade(color, -34);
      A.blob(ctx, 0, -r * 0.92, r * 0.32, r * 0.3);
      ink(ctx, 1.4);
      ctx.strokeStyle = A.shade(color, -50);           // 一对弯角
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.24, -r * 1.12);
      ctx.quadraticCurveTo(-r * 0.62, -r * 1.42, -r * 0.4, -r * 1.72);
      ctx.moveTo(r * 0.24, -r * 1.12);
      ctx.quadraticCurveTo(r * 0.62, -r * 1.42, r * 0.4, -r * 1.72);
      ctx.stroke();
      var eye = m && m.castFx > 0 ? '#fff' : '#ff6a4a';
      ctx.fillStyle = eye;
      A.blob(ctx, -r * 0.12, -r * 0.94, 2, 2.2);
      A.blob(ctx, r * 0.12, -r * 0.94, 2, 2.2);
      ctx.strokeStyle = '#efe6d0';                     // 獠牙
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 0.78); ctx.lineTo(-r * 0.13, -r * 0.66);
      ctx.moveTo(r * 0.1, -r * 0.78); ctx.lineTo(r * 0.13, -r * 0.66);
      ctx.stroke();
    },

    guard: function (ctx, r, color, t, m) {
      ctx.strokeStyle = A.shade(color, 40);            // 飘带，先画在身后
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.75;
      for (var i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.4, -r * 0.4);
        ctx.quadraticCurveTo(i * r * 1.2, r * 0.1 + Math.sin(t / 240 + i) * 4,
          i * r * 0.9, r * 0.9);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;                           // 收身的轻甲
      ctx.beginPath();
      ctx.moveTo(-r * 0.46, r * 0.82);
      ctx.lineTo(-r * 0.3, -r * 0.2);
      ctx.lineTo(-r * 0.56, -r * 0.56);
      ctx.quadraticCurveTo(0, -r * 0.78, r * 0.56, -r * 0.56);
      ctx.lineTo(r * 0.3, -r * 0.2);
      ctx.lineTo(r * 0.46, r * 0.82);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.7);
      ctx.fillStyle = A.shade(color, 60);              // 胸前护心镜
      A.blob(ctx, 0, -r * 0.24, r * 0.16, r * 0.16);
      ctx.fillStyle = '#e8d2b4';
      A.blob(ctx, 0, -r * 0.82, r * 0.3, r * 0.32);
      ink(ctx, 1.3);
      ctx.fillStyle = '#1a1a24';                       // 高髻
      ctx.beginPath();
      ctx.arc(0, -r * 0.9, r * 0.32, Math.PI, Math.PI * 2);
      ctx.fill();
      A.blob(ctx, -r * 0.26, -r * 1.16, r * 0.14, r * 0.18);
      A.blob(ctx, r * 0.26, -r * 1.16, r * 0.14, r * 0.18);
      ctx.strokeStyle = '#d8dee4';                     // 双刃
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.62, r * 0.2); ctx.lineTo(-r * 1.1, -r * 0.5);
      ctx.moveTo(r * 0.62, r * 0.2); ctx.lineTo(r * 1.1, -r * 0.5);
      ctx.stroke();
      if (m && m.castFx > 0) {
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 6;
        ctx.strokeStyle = A.shade(color, 90);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },

    elder: function (ctx, r, color, t) {
      var hunch = Math.sin(t / 520) * 0.04;
      ctx.rotate(hunch);
      ctx.strokeStyle = '#6b5a45';                     // 拐杖
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 0.78, r * 0.9);
      ctx.quadraticCurveTo(r * 0.92, -r * 0.3, r * 0.7, -r * 1.05);
      ctx.stroke();
      ctx.fillStyle = color;                           // 佝偻的长袍
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r * 0.88);
      ctx.quadraticCurveTo(-r * 0.62, -r * 0.2, -r * 0.2, -r * 0.5);
      ctx.quadraticCurveTo(r * 0.3, -r * 0.62, r * 0.42, -r * 0.34);
      ctx.quadraticCurveTo(r * 0.6, r * 0.3, r * 0.72, r * 0.88);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.8);
      ctx.fillStyle = '#d8c0a0';                       // 头前倾
      A.blob(ctx, -r * 0.3, -r * 0.74, r * 0.3, r * 0.3);
      ink(ctx, 1.3);
      ctx.strokeStyle = '#e8e4dc';                     // 长须
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (var i = -1; i <= 1; i++) {
        ctx.moveTo(-r * 0.3 + i * r * 0.1, -r * 0.54);
        ctx.quadraticCurveTo(-r * 0.36 + i * r * 0.12, -r * 0.1,
          -r * 0.3 + i * r * 0.14, r * 0.3 + Math.sin(t / 420 + i) * 2);
      }
      ctx.stroke();
      ctx.fillStyle = '#efe8dc';                       // 秃顶两侧的白发
      A.blob(ctx, -r * 0.54, -r * 0.84, r * 0.12, r * 0.18);
      A.blob(ctx, -r * 0.06, -r * 0.84, r * 0.12, r * 0.18);
      ctx.fillStyle = '#2a2a34';
      A.blob(ctx, -r * 0.42, -r * 0.78, 1.8, 1.6);
      ctx.rotate(-hunch);
    },

    // ══ 虫类细分 ═══════════════════════════════════════════
    bee: function (ctx, r, color, t) {
      var buzz = Math.sin(t / 60) * 1.2;
      ctx.translate(0, buzz);
      ctx.fillStyle = 'rgba(230,240,255,0.5)';         // 振翅
      var flap = Math.abs(Math.sin(t / 45)) * r * 0.5 + r * 0.2;
      A.blob(ctx, -r * 0.2, -r * 0.6, r * 0.5, flap * 0.5);
      A.blob(ctx, r * 0.3, -r * 0.6, r * 0.5, flap * 0.5);
      ctx.fillStyle = color;                           // 分节的腹
      A.blob(ctx, r * 0.5, 0, r * 0.5, r * 0.4);
      ctx.fillStyle = A.shade(color, -55);
      A.blob(ctx, r * 0.62, 0, r * 0.16, r * 0.36);
      A.blob(ctx, r * 0.24, 0, r * 0.16, r * 0.38);
      ctx.fillStyle = color;
      A.blob(ctx, -r * 0.35, -r * 0.1, r * 0.38, r * 0.34);
      ink(ctx, 1.4);
      ctx.strokeStyle = A.shade(color, -60);           // 尾针
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 0.98, r * 0.05); ctx.lineTo(r * 1.45, r * 0.2);
      ctx.moveTo(-r * 0.5, -r * 0.34); ctx.lineTo(-r * 0.8, -r * 0.76);
      ctx.moveTo(-r * 0.36, -r * 0.36); ctx.lineTo(-r * 0.5, -r * 0.82);
      ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      A.blob(ctx, -r * 0.5, -r * 0.14, 2, 2.2);
      ctx.translate(0, -buzz);
    },

    leech: function (ctx, r, color, t) {
      ctx.fillStyle = color;                           // 蠕动的软体，没有腿
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, r * 0.1);
      for (var i = 0; i <= 6; i++) {
        var px = -r * 1.1 + (i / 6) * r * 2.2;
        var py = Math.sin(t / 150 + i * 0.8) * r * 0.22;
        ctx.quadraticCurveTo(px, py - r * 0.5, px + r * 0.18, py - r * 0.1);
      }
      for (var j = 6; j >= 0; j--) {
        var qx = -r * 1.1 + (j / 6) * r * 2.2;
        var qy = Math.sin(t / 150 + j * 0.8) * r * 0.22;
        ctx.quadraticCurveTo(qx, qy + r * 0.52, qx - r * 0.18, qy + r * 0.12);
      }
      ctx.closePath();
      ctx.fill();
      ink(ctx, 1.6);
      ctx.fillStyle = A.shade(color, -45);             // 环节
      ctx.globalAlpha = 0.6;
      for (var k = -2; k <= 2; k++) {
        A.blob(ctx, k * r * 0.4, Math.sin(t / 150 + k * 0.8) * r * 0.2, r * 0.05, r * 0.3);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3a0c14';                       // 吸盘口
      A.blob(ctx, -r * 1.06, r * 0.05, r * 0.2, r * 0.22);
      ctx.fillStyle = '#ff8a8a';
      A.blob(ctx, -r * 1.06, r * 0.05, r * 0.08, r * 0.1);
    },

    centipede: function (ctx, r, color, t) {
      ctx.strokeStyle = A.shade(color, -30);           // 密密的腿
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i < 7; i++) {
        var lx = -r * 1.1 + i * r * 0.36;
        var ly = Math.sin(t / 130 + i * 0.7) * r * 0.16;
        ctx.moveTo(lx, ly - r * 0.2); ctx.lineTo(lx - r * 0.12, ly - r * 0.66);
        ctx.moveTo(lx, ly + r * 0.2); ctx.lineTo(lx - r * 0.12, ly + r * 0.66);
      }
      ctx.stroke();
      ctx.fillStyle = color;                           // 一节一节的身子
      for (var j = 0; j < 7; j++) {
        var bx = -r * 1.1 + j * r * 0.36;
        var by = Math.sin(t / 130 + j * 0.7) * r * 0.16;
        A.blob(ctx, bx, by, r * 0.24, r * 0.26);
      }
      ctx.fillStyle = A.shade(color, 30);
      A.blob(ctx, r * 1.16, Math.sin(t / 130 + 7 * 0.7) * r * 0.16, r * 0.3, r * 0.3);
      ink(ctx, 1.4);
      ctx.strokeStyle = A.shade(color, -50);           // 颚
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(r * 1.3, -r * 0.1); ctx.lineTo(r * 1.62, -r * 0.4);
      ctx.moveTo(r * 1.3, r * 0.1); ctx.lineTo(r * 1.62, r * 0.4);
      ctx.stroke();
      ctx.fillStyle = '#ffdd66';
      A.blob(ctx, r * 1.2, -r * 0.08, 1.8, 1.8);
      A.blob(ctx, r * 1.2, r * 0.08, 1.8, 1.8);
    },

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

    fox: function (ctx, r, color, t, m) {
      ctx.fillStyle = color;
      A.blob(ctx, 0, 0, r * 0.95, r * 0.6);
      ink(ctx, 1.6);
      // 尾巴条数由数据给：狐妖一条、幼狐三条、小白九条。
      // 原来写死五条，三只狐狸站一起完全一个样
      var tails = (m && m.def.tails) || 1;
      var half = (tails - 1) / 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = r * (tails > 5 ? 0.15 : 0.22);
      ctx.lineCap = 'round';
      for (var i = -half; i <= half; i++) {
        ctx.beginPath();
        ctx.moveTo(r * 0.8, 0);
        var spread = tails > 1 ? 1 : 0;
        ctx.quadraticCurveTo(
          r * 1.5, i * r * 0.3 * spread + Math.sin(t / 260 + i) * 3,
          r * 1.75, i * r * 0.5 * spread - r * 0.2
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
