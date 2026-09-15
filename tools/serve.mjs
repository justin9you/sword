/**
 * 本地静态服务器——专门用来把这个 PWA 装进 iPhone。
 *
 * 为什么不能直接双击 index.html：
 * Service Worker 只在 http(s) 下才注册，file:// 打开装不了主屏幕、也没法离线。
 *
 *   node tools/serve.mjs [端口]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (rel === '/') rel = '/index.html';

  // 防目录穿越：解析后必须仍在 ROOT 之内
  const file = path.join(ROOT, rel);
  const resolved = path.resolve(file);
  if (resolved !== path.resolve(ROOT) && !resolved.startsWith(path.resolve(ROOT) + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // 开发期不缓存，改了代码刷新就能看到；装机后的离线缓存由 sw.js 负责
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    });
    res.end(data);
  });
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddresses();
  const line = '─'.repeat(52);
  console.log('\n' + line);
  console.log('  诛仙 · 江湖录  ·  本地服务器已启动');
  console.log(line);
  console.log('\n  这台电脑上打开：');
  console.log('     http://localhost:' + PORT + '\n');
  if (lan.length) {
    console.log('  iPhone 上打开（手机要和电脑连同一个 WiFi）：');
    for (const ip of lan) console.log('     http://' + ip + ':' + PORT);
    console.log('\n  在 Safari 里打开上面的地址 → 点底部分享键 → 添加到主屏幕');
    console.log('  装完就能断网玩，这个窗口也可以关掉。\n');
  } else {
    console.log('  没检测到局域网 IP，手机可能连不上。\n');
  }
  console.log(line);
  console.log('  Ctrl+C 停止\n');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('\n端口 ' + PORT + ' 被占用了。换一个：node tools/serve.mjs 8090\n');
  } else {
    console.error(e);
  }
  process.exit(1);
});
