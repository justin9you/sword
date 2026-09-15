/**
 * 生成 PWA 图标 PNG。
 *
 * 不依赖任何 npm 包：用 SDF 直接光栅化（自带抗锯齿），
 * 再用 Node 内置 zlib 手写 PNG 编码。
 *
 *   node tools/gen-icons.mjs
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');

// ── PNG 编码 ──────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 绘制工具 ──────────────────────────────────────────────────

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** 距离场 → 覆盖率，1px 过渡带就是抗锯齿 */
const cover = (d, aa = 1.0) => 1 - smoothstep(-aa, aa, d);

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function sdCapsule(px, py, ax, ay, bx, by, r) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

class Img {
  constructor(size) {
    this.size = size;
    this.buf = Buffer.alloc(size * size * 4);
  }
  /** 在 (x,y) 上叠一层颜色 */
  blend(x, y, r, g, b, a) {
    if (a <= 0) return;
    const i = (y * this.size + x) * 4;
    const da = this.buf[i + 3] / 255;
    const out = a + da * (1 - a);
    if (out <= 0) return;
    this.buf[i] = Math.round((r * a + this.buf[i] * da * (1 - a)) / out);
    this.buf[i + 1] = Math.round((g * a + this.buf[i + 1] * da * (1 - a)) / out);
    this.buf[i + 2] = Math.round((b * a + this.buf[i + 2] * da * (1 - a)) / out);
    this.buf[i + 3] = Math.round(out * 255);
  }
  /** 用一个 (x,y) → {r,g,b,a} 的着色器铺满全图 */
  shade(fn) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const c = fn(x + 0.5, y + 0.5);
        if (c && c.a > 0) this.blend(x, y, c.r, c.g, c.b, c.a);
      }
    }
  }
}

// ── 图标画法 ──────────────────────────────────────────────────

/**
 * 一柄竖立的古剑，背后一轮血月，底下压着墨色云气。
 * 小尺寸下能认出来的只有「剑」这一个形，所以剑占满高度、其余全是氛围。
 *
 * @param {number} size 边长
 * @param {number} inset 内容缩进比例（maskable 要留安全区）
 */
function drawIcon(size, inset = 0) {
  const img = new Img(size);
  const S = size;
  const aa = S / 180;                 // 抗锯齿带宽随尺寸缩放
  const k = 1 - inset;                // 内容缩放
  const cx = S / 2, cy = S / 2;

  // 1. 夜色：上墨蓝、下近黑（满幅不透明，iOS 会自己套圆角遮罩）
  img.shade((x, y) => {
    const t = y / S;
    return {
      r: Math.round(mix(14, 5, t * t)),
      g: Math.round(mix(20, 7, t)),
      b: Math.round(mix(34, 12, t)),
      a: 1,
    };
  });

  // 2. 血月：偏上，压得很暗，只做背景的一块暖色
  const moonR = 0.30 * S * k;
  const moonY = cy - 0.14 * S * k;
  img.shade((x, y) => {
    const d = sdCircle(x, y, cx, moonY, moonR);
    return { r: 190, g: 58, b: 74, a: cover(d, aa) * 0.5 };
  });
  // 月晕
  img.shade((x, y) => {
    const d = Math.hypot(x - cx, y - moonY) / (S * 0.46);
    return { r: 220, g: 80, b: 90, a: Math.pow(clamp01(1 - d), 2.6) * 0.3 };
  });

  // 3. 底部云气：一条横向的墨带，把剑尖托住
  img.shade((x, y) => {
    const d = Math.hypot((x - cx) / (S * 0.75), (y - S * 1.04) / (S * 0.34));
    return { r: 6, g: 8, b: 16, a: Math.pow(clamp01(1 - d), 1.6) * 0.92 };
  });

  // 4. 四角压暗，聚光到中央
  img.shade((x, y) => {
    const d = Math.hypot(x - cx, y - cy) / (S * 0.72);
    return { r: 3, g: 4, b: 9, a: Math.pow(clamp01(d), 2.2) * 0.6 };
  });

  // ── 剑 ──────────────────────────────────────────────
  const tipY = cy - 0.40 * S * k;     // 剑尖
  const guardY = cy + 0.17 * S * k;   // 护手
  const buttY = cy + 0.40 * S * k;    // 剑柄末端
  const bladeR = 0.042 * S * k;

  // 剑气：沿剑身的一层青色辉光，先画，后面被剑身盖住中间
  img.shade((x, y) => {
    const d = sdCapsule(x, y, cx, tipY, cx, guardY, bladeR * 2.6);
    return { r: 130, g: 220, b: 255, a: cover(d, aa * 6) * 0.3 };
  });

  // 剑影
  img.shade((x, y) => {
    const d = sdCapsule(x, y - 0.014 * S, cx, tipY, cx, buttY, bladeR * 1.25);
    return { r: 0, g: 0, b: 0, a: cover(d, aa * 2) * 0.45 };
  });

  /** 剑身的金属色：中脊亮、刃口暗，做出起脊的立体感 */
  const steel = (x) => {
    const t = clamp01(Math.abs(x - cx) / bladeR);   // 0=中脊 1=刃口
    const lit = 1 - t * 0.55;
    return {
      r: Math.round(mix(150, 246, lit)),
      g: Math.round(mix(180, 252, lit)),
      b: Math.round(mix(205, 255, lit)),
    };
  };

  // 剑身：从收锋处画到护手
  const taper = bladeR * 3.2;         // 剑尖这一段的长度
  img.shade((x, y) => {
    const d = sdCapsule(x, y, cx, tipY + taper, cx, guardY, bladeR);
    const c = cover(d, aa);
    if (c <= 0) return null;
    const col = steel(x);
    col.a = c;
    return col;
  });

  // 剑尖：直接画一个收窄的楔形叠上去。
  // 不用「拿背景色把圆头擦掉」的做法——那会连背后的月亮一起抹平。
  img.shade((x, y) => {
    if (y < tipY || y > tipY + taper) return null;
    const half = ((y - tipY) / taper) * bladeR;
    const c = cover(Math.abs(x - cx) - half, aa);
    if (c <= 0) return null;
    const col = steel(x);
    col.a = c;
    return col;
  });

  // 护手：横向一道
  img.shade((x, y) => {
    const d = sdCapsule(x, y, cx - 0.145 * S * k, guardY, cx + 0.145 * S * k, guardY, bladeR * 0.78);
    const c = cover(d, aa);
    if (c <= 0) return null;
    const lit = clamp01(0.75 - (y - guardY) / (bladeR * 2));
    return {
      r: Math.round(mix(120, 232, lit)),
      g: Math.round(mix(88, 190, lit)),
      b: Math.round(mix(40, 92, lit)),
      a: c,
    };
  });

  // 剑柄：缠绳的深褐
  img.shade((x, y) => {
    const d = sdCapsule(x, y, cx, guardY + bladeR, cx, buttY, bladeR * 0.72);
    const c = cover(d, aa);
    if (c <= 0) return null;
    const t = clamp01(Math.abs(x - cx) / (bladeR * 0.72));
    const lit = 1 - t * 0.5;
    return {
      r: Math.round(mix(52, 104, lit)),
      g: Math.round(mix(34, 70, lit)),
      b: Math.round(mix(26, 52, lit)),
      a: c,
    };
  });

  // 剑首：一颗圆珠
  img.shade((x, y) => {
    const d = sdCircle(x, y, cx, buttY, bladeR * 0.92);
    const c = cover(d, aa);
    if (c <= 0) return null;
    const nx = (x - cx) / bladeR, ny = (y - buttY) / bladeR;
    const lit = clamp01(0.7 - (nx * 0.5 + ny * 0.6));
    return {
      r: Math.round(mix(140, 240, lit)),
      g: Math.round(mix(100, 196, lit)),
      b: Math.round(mix(46, 96, lit)),
      a: c,
    };
  });

  // 剑身高光：一条细亮线，小尺寸下也能看出是金属
  img.shade((x, y) => {
    const d = sdCapsule(x, y, cx - bladeR * 0.3, tipY + bladeR * 3.6, cx - bladeR * 0.3, guardY - bladeR, bladeR * 0.14);
    return { r: 255, g: 255, b: 255, a: cover(d, aa) * 0.8 };
  });

  return img;
}

// ── 输出 ──────────────────────────────────────────────────────

fs.mkdirSync(OUT, { recursive: true });

const jobs = [
  { file: 'icon-180.png', size: 180, inset: 0 },
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  // maskable 要留出安全区，圆形裁切下不会切到内容
  { file: 'icon-maskable-512.png', size: 512, inset: 0.19 },
];

for (const j of jobs) {
  const img = drawIcon(j.size, j.inset);
  const png = encodePNG(j.size, j.size, img.buf);
  fs.writeFileSync(path.join(OUT, j.file), png);
  console.log('✓ icons/' + j.file + '  ' + j.size + '×' + j.size + '  ' + (png.length / 1024).toFixed(1) + ' KB');
}

console.log('\n图标生成完毕。');
