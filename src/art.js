/**
 * 矢量作画。整个项目没有一张图片，所有东西都是 Canvas 路径画出来的。
 *
 * 风格取水墨仙侠：底色压暗、轮廓用墨线、法术用高饱和的一点亮色破开。
 * 每张图有自己的 biome 调色板，进图那一眼就该知道自己到了哪儿。
 *
 * 装饰物（树、竹、石、骨）的位置用地图 key 做种子随机——
 * 所以每次进同一张图，每棵树都长在同一个地方，但不用存任何地形数据。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  // ── 确定性随机 ──────────────────────────────────────────
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /** mulberry32：种子一样，序列就一样 */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── 调色板 ──────────────────────────────────────────────
  var BIOME = {
    village: { ground: '#3a4232', ground2: '#454e39', ink: '#1b1f18', accent: '#8fa86a', sky: '#2b3126' },
    mountain: { ground: '#39414b', ground2: '#434c57', ink: '#1a1e23', accent: '#9fb8cc', sky: '#2a3039' },
    bamboo: { ground: '#2f3d2f', ground2: '#394a37', ink: '#181f18', accent: '#7fbf6a', sky: '#243024' },
    town: { ground: '#463e34', ground2: '#52493d', ink: '#221d18', accent: '#e0a860', sky: '#332c25' },
    cave: { ground: '#2a2430', ground2: '#332c3a', ink: '#150f1a', accent: '#8f6aa8', sky: '#1d1823' },
    dead: { ground: '#2e3238', ground2: '#373c43', ink: '#151820', accent: '#7f9ab0', sky: '#21252b' },
    fire: { ground: '#3a2620', ground2: '#472e25', ink: '#1d120e', accent: '#e07040', sky: '#2a1a15' },
    forest: { ground: '#2c3a2e', ground2: '#354536', ink: '#161d17', accent: '#8fbf7a', sky: '#212c23' },
    swamp: { ground: '#2e3428', ground2: '#373e2f', ink: '#151a12', accent: '#9fb060', sky: '#232820' },
    dark: { ground: '#241f2b', ground2: '#2c2634', ink: '#120f16', accent: '#a86ab0', sky: '#1a161f' },
    sky: { ground: '#333e4e', ground2: '#3d4a5c', ink: '#191e26', accent: '#c0d8f0', sky: '#28313d' },
  };

  function palette(biome) {
    return BIOME[biome] || BIOME.village;
  }

  // ── 地形 ────────────────────────────────────────────────
  /**
   * 画地面。只画视口内的那几块，地图再大也不会拖慢。
   * cam = { x, y, w, h }
   */
  function ground(ctx, world, cam) {
    var p = palette(world.def.biome);
    var T = ZX.CONFIG.TILE;

    ctx.fillStyle = p.ground;
    ctx.fillRect(cam.x, cam.y, cam.w, cam.h);

    // 棋盘微差，给地面一点质感，不至于是一块死色
    var x0 = Math.floor(cam.x / T) - 1;
    var y0 = Math.floor(cam.y / T) - 1;
    var x1 = Math.ceil((cam.x + cam.w) / T) + 1;
    var y1 = Math.ceil((cam.y + cam.h) / T) + 1;

    ctx.fillStyle = p.ground2;
    for (var ty = y0; ty < y1; ty++) {
      for (var tx = x0; tx < x1; tx++) {
        if (((tx + ty) & 1) === 0) continue;
        ctx.fillRect(tx * T, ty * T, T, T);
      }
    }

    // 地图边界外压暗，视觉上收边
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    if (cam.x < 0) ctx.fillRect(cam.x, cam.y, -cam.x, cam.h);
    if (cam.y < 0) ctx.fillRect(cam.x, cam.y, cam.w, -cam.y);
    if (cam.x + cam.w > world.w) ctx.fillRect(world.w, cam.y, cam.x + cam.w - world.w, cam.h);
    if (cam.y + cam.h > world.h) ctx.fillRect(cam.x, world.h, cam.w, cam.y + cam.h - world.h);
  }

  /** 障碍：按 biome 画成房子 / 巨石 / 崖壁 */
  function blocks(ctx, world) {
    var p = palette(world.def.biome);
    var biome = world.def.biome;
    for (var i = 0; i < world.blocks.length; i++) {
      var b = world.blocks[i];

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);

      if (biome === 'village' || biome === 'town') {
        // 屋顶 + 墙
        ctx.fillStyle = '#4a4038';
        ctx.fillRect(b.x, b.y + b.h * 0.35, b.w, b.h * 0.65);
        ctx.fillStyle = biome === 'town' ? '#6b3a32' : '#5a4a3a';
        ctx.beginPath();
        ctx.moveTo(b.x - 8, b.y + b.h * 0.4);
        ctx.lineTo(b.x + b.w / 2, b.y - 6);
        ctx.lineTo(b.x + b.w + 8, b.y + b.h * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(b.x + b.w * 0.4, b.y + b.h * 0.62, b.w * 0.2, b.h * 0.38);
      } else if (biome === 'sky' || biome === 'dark') {
        // 石柱
        ctx.fillStyle = p.ground2;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = p.accent;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
        ctx.globalAlpha = 1;
      } else {
        // 岩体：不规则多边形，看着不像方块
        var r = seeded(hashStr(world.key + i));
        ctx.fillStyle = shade(p.ground2, -14);
        ctx.beginPath();
        var pts = 7;
        for (var k = 0; k < pts; k++) {
          var a = (k / pts) * Math.PI * 2;
          var rad = 0.42 + r() * 0.12;
          var px = b.x + b.w / 2 + Math.cos(a) * b.w * rad;
          var py = b.y + b.h / 2 + Math.sin(a) * b.h * rad;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  /** 装饰散点。位置由地图 key 播种，进出图不会变 */
  function decor(ctx, world, cam) {
    var def = world.def;
    if (!def.decor) return;
    var p = palette(def.biome);
    var rnd = seeded(hashStr(def.key + ':decor'));

    for (var kind in def.decor) {
      if (!Object.prototype.hasOwnProperty.call(def.decor, kind)) continue;
      var n = def.decor[kind];
      for (var i = 0; i < n; i++) {
        var x = rnd() * world.w;
        var y = rnd() * world.h;
        var s = 0.7 + rnd() * 0.7;
        if (x < cam.x - 60 || x > cam.x + cam.w + 60) continue;
        if (y < cam.y - 80 || y > cam.y + cam.h + 60) continue;
        drawDecor(ctx, kind, x, y, s, p, rnd);
      }
    }
  }

  function drawDecor(ctx, kind, x, y, s, p, rnd) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    switch (kind) {
      case 'tree':
      case 'deadtree':
        shadow(ctx, 0, 4, 16, 6);
        ctx.strokeStyle = '#3a2e22';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.lineTo(0, -22);
        ctx.stroke();
        if (kind === 'tree') {
          ctx.fillStyle = p.accent;
          ctx.globalAlpha = 0.85;
          blob(ctx, 0, -32, 20, 14);
          ctx.globalAlpha = 1;
        } else {
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -18); ctx.lineTo(-12, -30);
          ctx.moveTo(0, -14); ctx.lineTo(13, -27);
          ctx.stroke();
        }
        break;

      case 'bamboo':
        shadow(ctx, 0, 4, 10, 4);
        ctx.strokeStyle = '#6fae5a';
        ctx.lineWidth = 4;
        for (var b = -1; b <= 1; b++) {
          ctx.beginPath();
          ctx.moveTo(b * 7, 4);
          ctx.lineTo(b * 7 + b * 3, -44 - Math.abs(b) * 6);
          ctx.stroke();
        }
        ctx.fillStyle = '#8fd07a';
        ctx.globalAlpha = 0.7;
        blob(ctx, 0, -46, 16, 8);
        ctx.globalAlpha = 1;
        break;

      case 'rock':
        shadow(ctx, 0, 3, 14, 5);
        ctx.fillStyle = shade(p.ground2, 10);
        ctx.beginPath();
        ctx.moveTo(-13, 3); ctx.lineTo(-7, -10); ctx.lineTo(6, -12);
        ctx.lineTo(13, -2); ctx.lineTo(8, 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        break;

      case 'grass':
        ctx.strokeStyle = p.accent;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (var g = -1; g <= 1; g++) {
          ctx.moveTo(g * 4, 0);
          ctx.quadraticCurveTo(g * 6, -6, g * 9, -10);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;

      case 'stalag':
        shadow(ctx, 0, 2, 10, 4);
        ctx.fillStyle = shade(p.ground2, 14);
        ctx.beginPath();
        ctx.moveTo(-8, 4); ctx.lineTo(0, -30); ctx.lineTo(8, 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        break;

      case 'crystal':
        ctx.fillStyle = p.accent;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(0, -20); ctx.lineTo(7, -4); ctx.lineTo(0, 4); ctx.lineTo(-7, -4);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;

      case 'bone':
        ctx.strokeStyle = '#cfc7b4';
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-9, 0); ctx.lineTo(9, -3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-10, 0, 3, 0, 7);
        ctx.arc(10, -3, 3, 0, 7);
        ctx.fillStyle = '#cfc7b4';
        ctx.fill();
        ctx.globalAlpha = 1;
        break;

      case 'lava':
      case 'ember':
        ctx.fillStyle = kind === 'lava' ? '#d8522a' : '#f0a050';
        ctx.globalAlpha = kind === 'lava' ? 0.55 : 0.4;
        blob(ctx, 0, 0, kind === 'lava' ? 18 : 5, kind === 'lava' ? 9 : 3);
        ctx.globalAlpha = 1;
        break;

      case 'cloud':
      case 'fog':
        ctx.fillStyle = kind === 'cloud' ? '#c8dcf0' : '#8fa0b0';
        ctx.globalAlpha = 0.16;
        blob(ctx, 0, 0, 44, 16);
        blob(ctx, 22, -6, 30, 12);
        ctx.globalAlpha = 1;
        break;

      case 'lantern':
        ctx.strokeStyle = '#6b5a45';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 4); ctx.lineTo(0, -26);
        ctx.stroke();
        ctx.fillStyle = '#e0603a';
        blob(ctx, 0, -32, 8, 10);
        ctx.fillStyle = 'rgba(240,160,80,0.25)';
        blob(ctx, 0, -32, 22, 22);
        break;

      case 'stall':
        shadow(ctx, 0, 4, 20, 6);
        ctx.fillStyle = '#7a5a3a';
        ctx.fillRect(-18, -8, 36, 12);
        ctx.fillStyle = '#b05040';
        ctx.beginPath();
        ctx.moveTo(-22, -10); ctx.lineTo(0, -26); ctx.lineTo(22, -10);
        ctx.closePath();
        ctx.fill();
        break;

      case 'pillar':
        shadow(ctx, 0, 6, 16, 6);
        ctx.fillStyle = shade(p.ground2, 18);
        ctx.fillRect(-10, -52, 20, 58);
        ctx.fillStyle = p.accent;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(-12, -56, 24, 6);
        ctx.globalAlpha = 1;
        break;

      case 'torch':
        ctx.strokeStyle = '#4a3a2a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 4); ctx.lineTo(0, -22);
        ctx.stroke();
        ctx.fillStyle = '#f07a30';
        blob(ctx, 0, -28, 6, 9);
        ctx.fillStyle = 'rgba(240,120,50,0.2)';
        blob(ctx, 0, -28, 26, 26);
        break;

      case 'sword':
        ctx.strokeStyle = '#b8cee0';
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 6); ctx.lineTo(0, -28);
        ctx.moveTo(-7, -20); ctx.lineTo(7, -20);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;

      case 'vine':
      case 'swamp':
        ctx.strokeStyle = kind === 'vine' ? '#6f8a4a' : '#4a5a38';
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.quadraticCurveTo(0, -12, 14, 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;

      case 'bat':
        ctx.fillStyle = '#2a1f2a';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(-8, 0); ctx.quadraticCurveTo(0, -6, 8, 0);
        ctx.quadraticCurveTo(0, 3, -8, 0);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;

      default:
        break;
    }
    ctx.restore();
  }

  // ── 基础图元 ────────────────────────────────────────────
  function blob(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    blob(ctx, x, y, rx, ry);
  }

  /** #rrggbb 提亮/压暗 */
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  ZX.Art = {
    palette: palette,
    ground: ground,
    blocks: blocks,
    decor: decor,
    blob: blob,
    shadow: shadow,
    shade: shade,
    seeded: seeded,
    hashStr: hashStr,
  };
})(window);
