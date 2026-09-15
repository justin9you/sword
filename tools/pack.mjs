/**
 * 打部署包。
 *
 *   node tools/pack.mjs
 *
 * 自己写 ZIP 而不用系统的压缩工具，是因为 Windows 的 Compress-Archive
 * 会把路径分隔符写成反斜杠（违反 ZIP 规范），传到 Cloudflare Pages / GitHub
 * 或在 macOS 上解压会变成一堆带反斜杠的怪文件名。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '诛仙-部署包.zip');

/** 上线只需要这些；tools/ 和测试不进包 */
const FILES = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'README.md'];
const DIRS = ['src', 'icons'];

// ── CRC32 ─────────────────────────────────────────────────────

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

// ── 收集文件 ──────────────────────────────────────────────────

function walk(dir, base, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    // ZIP 规范要求用正斜杠
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (st.isDirectory()) walk(full, base, out);
    else out.push({ name: rel, data: fs.readFileSync(full) });
  }
  return out;
}

const entries = [];
for (const f of FILES) entries.push({ name: f, data: fs.readFileSync(path.join(ROOT, f)) });
for (const d of DIRS) walk(path.join(ROOT, d), ROOT, entries);

// ── 写 ZIP ────────────────────────────────────────────────────

const chunks = [];
const central = [];
let offset = 0;

// DOS 时间戳：固定值即可，解压工具只当作文件修改时间
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

for (const e of entries) {
  const nameBuf = Buffer.from(e.name, 'utf8');
  const deflated = zlib.deflateRawSync(e.data, { level: 9 });
  // 压完反而更大就直接存原始数据
  const useDeflate = deflated.length < e.data.length;
  const body = useDeflate ? deflated : e.data;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(e.data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0x0800, 6);        // flag: 文件名是 UTF-8
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(e.data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  chunks.push(local, nameBuf, body);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);              // version made by
  cen.writeUInt16LE(20, 6);              // version needed
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(method, 10);
  cen.writeUInt16LE(DOS_TIME, 12);
  cen.writeUInt16LE(DOS_DATE, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(body.length, 20);
  cen.writeUInt32LE(e.data.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

fs.writeFileSync(OUT, Buffer.concat([...chunks, centralBuf, end]));

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';
console.log('\n部署包 → ' + OUT);
console.log('总大小  ' + kb(fs.statSync(OUT).size) + '   共 ' + entries.length + ' 个文件\n');
for (const e of entries) console.log('  ' + e.name.padEnd(32) + kb(e.data.length));
console.log('');
