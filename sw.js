/**
 * Service Worker：把全部资源预缓存到本地。
 *
 * 装到主屏幕并成功跑过一次之后，断网 / 关掉电脑 / 开飞行模式都能玩。
 * VERSION 由 tools/stamp-sw.mjs 从所有被缓存资源的内容哈希自动生成，
 * 不要手改。改完代码跑 npm run stamp（npm test 会校验它有没有过期）。
 */
const PREFIX = 'zx-';
const VERSION = PREFIX + 'vf908ce8b2a';

/** 少一个都跑不起来的：必须全部缓存成功，否则整次安装作废 */
const CORE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/config.js',
  './src/util.js',
  './src/stats.js',
  './src/data/sects.js',
  './src/data/items.js',
  './src/data/monsters.js',
  './src/data/maps.js',
  './src/data/npcs.js',
  './src/data/quests.js',
  './src/inventory.js',
  './src/player.js',
  './src/combat.js',
  './src/world.js',
  './src/skills.js',
  './src/quest.js',
  './src/save.js',
  './src/audio.js',
  './src/art.js',
  './src/art-actors.js',
  './src/render.js',
  './src/input.js',
  './src/ui.js',
  './src/ui-panels.js',
  './src/main.js',
];

/** 少了也能玩的：失败就算了，不连累安装 */
const OPTIONAL = [
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      // CORE 用 addAll：任何一个失败就整体 reject，install 失败，
      // 旧 SW 和旧缓存原样保留。否则会留下「装上了但缺 JS、离线永久白屏」的坏状态。
      await cache.addAll(CORE);
      await Promise.allSettled(OPTIONAL.map((url) => cache.add(url)));
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // 只删自己的旧版本。不按前缀过滤的话，会把同一个 github.io 域名下
        // 其他项目的缓存一起删光，害别的 PWA 离线打不开。
        keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * 页面问「你是哪一版」时如实回答。
 *
 * 缓存出问题时，最难受的是分不清「代码没发上去」还是「本地缓存没换」——
 * 两者现象一模一样。让当前真正在控制页面的这个 SW 自报版本，就能一眼分辨。
 */
self.addEventListener('message', (event) => {
  if (event.data !== 'version') return;
  const reply = { type: 'version', version: VERSION };
  if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
  else if (event.source) event.source.postMessage(reply);
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 打开页面：网络优先，联网时总能拿到最新的 index.html。
  // 这是唯一的自愈通道——万一忘了 bump VERSION，全站 cache-first 会把
  // 已装到主屏幕的用户永久钉死在旧代码上，而 standalone 模式没有地址栏和刷新按钮。
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then((hit) => hit || caches.match('./index.html', { ignoreSearch: true }))
          .then((hit) => hit || new Response('离线且无缓存', { status: 504 })))
    );
    return;
  }

  // 其余静态资源：缓存优先。启动最快，也最省电。
  //
  // 只查当前版本的缓存。不指定缓存名的 caches.match() 会搜遍所有版本，
  // 万一 activate 阶段旧缓存没删干净，就会一直命中旧文件——
  // 表现是"明明发了新版，刷新多少次还是老样子"，且无从排查。
  event.respondWith(
    caches.open(VERSION).then((cache) => cache.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;

      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => new Response('', { status: 504, statusText: 'offline' }));
    }))
  );
});
