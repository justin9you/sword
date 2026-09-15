/**
 * 把 sw.js 的缓存版本号打成「所有被缓存资源的内容哈希」。
 *
 *   node tools/stamp-sw.mjs           写入新版本号
 *   node tools/stamp-sw.mjs --check   只检查，不一致就非零退出（给 npm test 用）
 *
 * 为什么要自动化：VERSION 是 PWA 唯一的更新开关。改了游戏代码却忘了改它，
 * 已经装到主屏幕的用户会被永久钉死在旧版本上——standalone 模式没有地址栏也没有
 * 刷新按钮，用户唯一的自救方式是长按删掉重装。这种错不该靠人记住。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = path.join(ROOT, 'sw.js');

const source = fs.readFileSync(SW, 'utf8');

/** 从 sw.js 里把 CORE / OPTIONAL 两个数组的路径抠出来，保证哈希覆盖的就是真正被缓存的文件 */
function assetList(src) {
  const out = [];
  for (const block of ['CORE', 'OPTIONAL']) {
    const m = src.match(new RegExp('const ' + block + '\\s*=\\s*\\[([\\s\\S]*?)\\]', 'm'));
    if (!m) continue;
    for (const q of m[1].matchAll(/'([^']+)'/g)) out.push(q[1]);
  }
  return out;
}

const assets = assetList(source);
const hash = crypto.createHash('sha256');

let counted = 0;
for (const rel of assets.sort()) {
  // './' 指的就是 index.html，别重复算
  if (rel === './') continue;
  const file = path.join(ROOT, rel.replace(/^\.\//, ''));
  if (!fs.existsSync(file)) {
    console.error('sw.js 的缓存清单里列了一个不存在的文件: ' + rel);
    process.exit(1);
  }
  hash.update(rel);
  hash.update(fs.readFileSync(file));
  counted++;
}

const stamp = 'v' + hash.digest('hex').slice(0, 10);
const current = (source.match(/const VERSION = PREFIX \+ '([^']+)'/) || [])[1];

if (process.argv.includes('--check')) {
  if (current === stamp) {
    console.log('✓ sw.js 版本号与资源内容一致 (' + stamp + ', 覆盖 ' + counted + ' 个文件)');
    process.exit(0);
  }
  console.error(
    '✗ sw.js 的 VERSION 过期了：当前 ' + current + '，应为 ' + stamp + '\n' +
    '  资源改了但版本号没跟上，已装到主屏幕的用户会一直拿到旧代码。\n' +
    '  跑一下：npm run stamp'
  );
  process.exit(1);
}

if (current === stamp) {
  console.log('sw.js 版本号已是最新 (' + stamp + ')，无需改动。');
  process.exit(0);
}

fs.writeFileSync(SW, source.replace(/const VERSION = PREFIX \+ '[^']+'/, "const VERSION = PREFIX + '" + stamp + "'"));
console.log('sw.js 版本号 ' + current + ' → ' + stamp + '（覆盖 ' + counted + ' 个文件）');
