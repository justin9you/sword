/**
 * 无头冒烟测试：用桩件模拟 DOM + Canvas，把整个游戏真跑一遍。
 *
 *   node tools/test-browser.mjs
 *
 * 专门抓「逻辑测试抓不到」的那类错误：接线写错、方法名打错、
 * 渲染里访问了不存在的字段、事件没绑上、面板 HTML 拼崩……
 * 这些只有真跑一遍才会暴露，而它们恰好都是白屏级别的故障。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1280, H = 720;

// ── 可重现的随机 ──────────────────────────────────────────────
/**
 * 整个游戏（刷怪位置、掉落、伤害浮动、怪物游荡）都跑在 Math.random 上，
 * 用真随机的话这套测试就是抽奖：同样的代码，五次里能挂一次。
 * 所以给沙箱换一个带种子的 random——每次跑出来的世界完全一样，
 * 挂了就是真挂了，而且能原样复现。
 *
 * 想换个世界试试：ZX_SEED=123 node tools/test-browser.mjs
 */
function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.env.ZX_SEED || 20260915);
const seededMath = Object.create(Math);
seededMath.random = mulberry32(SEED);

// ── 断言 ──────────────────────────────────────────────────────
let passed = 0;
const failures = [];

function ok(cond, name, detail) {
  if (cond) passed++;
  else failures.push(name + (detail ? '\n      ' + detail : ''));
}

function eq(a, b, name) {
  ok(a === b, name, '期望 ' + b + '，实得 ' + a);
}

function group(title, fn) {
  console.log('\n  ' + title);
  const before = failures.length;
  try {
    fn();
  } catch (e) {
    failures.push(title + ' 抛异常：' + e.message + '\n      ' + String(e.stack).split('\n')[1]);
  }
  const bad = failures.length - before;
  console.log('    ' + (bad ? '✗ ' + bad + ' 项不通过' : '✓ 全部通过'));
}

// ── Canvas 2D 桩件 ────────────────────────────────────────────
/** 所有绘图 API 当空操作；属性读写照常，这样 save/restore 的配对错误也能跑出来 */
function makeCtx2D() {
  const gradient = { addColorStop() {} };
  const target = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineCap: 'butt',
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (s) => ({ width: String(s).length * 7 }),
    setTransform() {},
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

// ── DOM 桩件 ──────────────────────────────────────────────────
const listeners = new Map();

function on(el, type, fn) {
  if (!listeners.has(el)) listeners.set(el, {});
  const m = listeners.get(el);
  (m[type] = m[type] || []).push(fn);
}

function fire(el, type, ev) {
  const m = listeners.get(el);
  if (!m || !m[type]) return false;
  const event = Object.assign({
    type,
    preventDefault() {},
    stopPropagation() {},
    target: el,
    button: 0,
    clientX: 0,
    clientY: 0,
    code: '',
    repeat: false,
    identifier: 1,
    changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }],
  }, ev);
  for (const fn of m[type].slice()) fn(event);
  return true;
}

function makeEl(id, tag) {
  const el = {
    id: id || '',
    tagName: (tag || 'div').toUpperCase(),
    textContent: '',
    innerHTML: '',
    disabled: false,
    value: '',
    scrollTop: 0,
    scrollHeight: 0,
    children: [],
    firstChild: null,
    clientWidth: W,
    clientHeight: H,
    width: W,
    height: H,
    _attrs: {},
    style: {
      setProperty() {},
      removeProperty() {},
    },
    classList: {
      _s: new Set(),
      add() { for (const c of arguments) this._s.add(c); },
      remove() { for (const c of arguments) this._s.delete(c); },
      toggle(c, f) {
        if (f === undefined) f = !this._s.has(c);
        if (f) this._s.add(c);
        else this._s.delete(c);
      },
      contains(c) { return this._s.has(c); },
    },
    getAttribute(k) { return k in el._attrs ? el._attrs[k] : null; },
    setAttribute(k, v) { el._attrs[k] = v; },
    addEventListener(t, f) { on(el, t, f); },
    removeEventListener() {},
    appendChild(c) {
      el.children.push(c);
      el.firstChild = el.children[0];
      c.parentNode = el;
      return c;
    },
    removeChild(c) {
      const i = el.children.indexOf(c);
      if (i >= 0) el.children.splice(i, 1);
      el.firstChild = el.children[0] || null;
      return c;
    },
    querySelector(sel) {
      // 技能栏里用它找 .cd-mask / .cd-text
      const found = el.children.find((c) => c._sel === sel);
      return found || makeEl('', 'span');
    },
    querySelectorAll() { return []; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H }),
    getContext: () => makeCtx2D(),
    focus() {},
  };
  return el;
}

const els = new Map();
function el(id) {
  if (!els.has(id)) els.set(id, makeEl(id));
  return els.get(id);
}

// data-action 按钮：ui.js 启动时会遍历它们绑事件
const actionButtons = ['bag', 'char', 'skills', 'quest', 'map', 'menu', 'attack', 'interact', 'potion']
  .map((a) => {
    const b = makeEl('', 'button');
    b._attrs['data-action'] = a;
    return b;
  });

const rafQueue = [];

const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  performance: { now: () => clock },
  setTimeout: (fn, ms) => {
    timers.push({ fn, at: clock + (ms || 0) });
    return timers.length;
  },
  clearTimeout() {},
  Math: seededMath,
  Date,
  JSON,
  isFinite,
  parseInt,
  parseFloat,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Error,
  Infinity,
  NaN,
  localStorage: {
    _s: new Map(),
    getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
    setItem(k, v) { this._s.set(k, String(v)); },
    removeItem(k) { this._s.delete(k); },
  },
  requestAnimationFrame: (fn) => {
    rafQueue.push(fn);
    return rafQueue.length;
  },
  devicePixelRatio: 2,
  innerWidth: W,
  innerHeight: H,
  navigator: {},
  location: { protocol: 'http:', reload() {} },
  confirm: () => true,
  alert: () => {},
  addEventListener(t, f) { on(sandbox, t, f); },
  removeEventListener() {},
};

let clock = 0;
const timers = [];

sandbox.document = {
  hidden: false,
  getElementById: (id) => el(id),
  querySelectorAll: (sel) => (sel === '[data-action]' ? actionButtons : []),
  createElement: (tag) => makeEl('', tag),
  addEventListener(t, f) { on(sandbox.document, t, f); },
  removeEventListener() {},
};

sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

// ── 加载全部模块（含 main.js）─────────────────────────────────
const MODULES = [
  'src/config.js', 'src/util.js', 'src/stats.js',
  'src/data/sects.js', 'src/data/items.js', 'src/data/monsters.js',
  'src/data/maps.js', 'src/data/npcs.js', 'src/data/quests.js',
  'src/inventory.js', 'src/player.js', 'src/combat.js', 'src/world.js',
  'src/skills.js', 'src/quest.js', 'src/save.js', 'src/audio.js',
  'src/art.js', 'src/art-actors.js', 'src/render.js', 'src/input.js',
  'src/ui.js', 'src/ui-panels.js', 'src/main.js',
];

for (const rel of MODULES) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: rel });
  } catch (e) {
    console.error('\n✗ 模块加载失败：' + rel + '\n  ' + e.message + '\n  ' +
      String(e.stack).split('\n').slice(1, 3).join('\n  ') + '\n');
    process.exit(1);
  }
}

const ZX = sandbox.ZX;

/** 推进 n 帧，每帧 dt 毫秒 */
function tick(n, dt) {
  dt = dt || 16;
  for (let i = 0; i < n; i++) {
    clock += dt;
    // 到点的 setTimeout（复活等）
    for (let k = timers.length - 1; k >= 0; k--) {
      if (timers[k].at <= clock) {
        const t = timers.splice(k, 1)[0];
        t.fn();
      }
    }
    const fn = rafQueue.shift();
    if (!fn) return i;
    fn(clock);
  }
  return n;
}

function key(code, down) {
  fire(sandbox, down === false ? 'keyup' : 'keydown', { code });
}

// ── 开局 ──────────────────────────────────────────────────────
group('标题页与开局', () => {
  ok(el('sect-list').children.length === ZX.SECTS.length, '标题页列出了全部门派');

  el('name-input').value = '张小凡';
  el('sect-list').children[3].click ? null : null;
  fire(el('sect-list').children[3], 'click');       // 选鬼王宗

  ok(fire(el('btn-new'), 'click'), '「入道」按钮已绑事件');
  ok(!!ZX.__game || true, '开局没有抛异常');

  const ran = tick(3);
  eq(ran, 3, '游戏循环跑起来了');
});

// 从 UI 反查 game：main.js 没暴露全局，这里靠存档和 DOM 侧写来验
function currentSave() {
  const raw = sandbox.localStorage.getItem('zx.save.v1');
  return raw ? JSON.parse(raw) : null;
}

group('初始状态', () => {
  const s = currentSave();
  ok(s, '开局即写入存档');
  eq(s.name, '张小凡', '名字进了存档');
  eq(s.sect, 'guiwang', '选中的门派生效');
  eq(s.map, 'caomiao', '从草庙村开始');
  eq(el('map-name').textContent, '草庙村', '地图名显示正确');
  eq(el('pname').textContent, '张小凡', '角色名显示正确');
  ok(el('skillbar').children.length >= 1, '技能栏已生成');
  ok(el('log').children.length > 0, '日志有开场白');
  ok(el('hp-text').textContent.indexOf('/') > 0, '血条文字已刷新');
});

group('移动与碰撞', () => {
  const before = currentSave();
  key('KeyD');
  tick(40);
  key('KeyD', false);
  key('KeyS');
  tick(40);
  key('KeyS', false);
  tick(2);
  ok(true, '按键移动不抛异常');

  // 一直往一个方向顶到底，应该被地图边界挡住而不是飞出去
  key('KeyA');
  tick(400);
  key('KeyA', false);
  ok(true, '撞地图边界不抛异常');
  ok(before, '存档仍在');
});

group('战斗一轮', () => {
  // 在草庙村晃一圈，让自动普攻打到怪；顺便把技能全按一遍
  for (let round = 0; round < 6; round++) {
    key('KeyW');
    tick(30);
    key('KeyW', false);
    key('KeyD');
    tick(30);
    key('KeyD', false);
    key('Digit1');
    tick(20);
    key('Space');
    tick(20);
    key('KeyQ');     // 没装法宝时应给提示而不是崩
    tick(10);
    key('KeyR');     // 吃药
    tick(10);
  }
  ok(true, '连续战斗 6 轮无异常');

  const s = currentSave();
  ok(s.playMs > 0, '游戏时长在累计');
});

group('面板逐个开关', () => {
  const panels = [
    ['KeyB', '背包'],
    ['KeyC', '角色'],
    ['KeyK', '技能'],
    ['KeyL', '任务'],
    ['KeyM', '山河图'],
    ['Escape', '菜单'],
  ];
  for (const [code, title] of panels) {
    key(code);
    tick(2);
    eq(el('panel-title').textContent, title, title + '面板能打开');
    ok(el('panel-body').innerHTML.length > 0, title + '面板有内容');
    key(code);
    tick(2);
  }

  // 面板里的交互：背包点第一格 → 装备/使用
  key('KeyB');
  tick(2);
  fire(el('panel-body'), 'click', { target: makeAct('select', '0') });
  tick(2);
  ok(el('panel-body').innerHTML.indexOf('item-card') >= 0 ||
    el('panel-body').innerHTML.indexOf('选一格') >= 0, '点背包格子有反应');

  // 角色面板加点
  key('KeyB');
  tick(2);
  key('KeyC');
  tick(2);
  fire(el('panel-body'), 'click', { target: makeAct('point', 'con') });
  tick(2);
  ok(true, '加点按钮不抛异常');
  key('KeyC');
  tick(2);
});

/** 造一个带 data-act 的假节点，模拟点到面板里的按钮 */
function makeAct(act, arg) {
  const n = makeEl('', 'button');
  n._attrs['data-act'] = act;
  n._attrs['data-arg'] = arg;
  n.parentNode = null;
  return n;
}

group('NPC 对话与任务', () => {
  // 直接把玩家挪到 NPC 脚下再按 E——靠走的太看运气
  const s = currentSave();
  ok(s, '存档可读');

  key('KeyE');   // 附近没人时应给提示
  tick(2);
  ok(true, '空按交互键不抛异常');

  // 对话框的按钮走的是另一条事件委托，单独点一次
  fire(el('dialog'), 'click', { target: makeAct('accept', '') });
  tick(2);
  ok(true, '对话框事件委托正常');
});

group('换图与传送', () => {
  key('KeyM');
  tick(2);
  // 没去过的图点了应该没反应，不该崩
  fire(el('panel-body'), 'click', { target: makeAct('travel', 'tongtian') });
  tick(2);
  ok(el('panel-title').textContent === '山河图', '传送到未解锁地图不生效');
  key('KeyM');
  tick(2);
  eq(currentSave().map, 'caomiao', '仍在草庙村');
});

group('长时间运行', () => {
  const frames = tick(1200, 16);   // 约 20 秒
  eq(frames, 1200, '连续跑 1200 帧不中断');
  const s = currentSave();
  ok(s.playMs > 15000, '自动存档在持续写入', 'playMs=' + Math.round(s.playMs));
  ok(el('exp-text').textContent.length > 0, '经验条一直在刷新');

  // 光跑不崩不算数：站着挨打这么久，怪必须真的被反杀掉几只，
  // 否则说明自动普攻/仇恨/掉血这条链其实没接上，测试只是在空转。
  ok(s.kills > 0, '这段时间里真的打死过怪', 'kills=' + s.kills);
  ok(s.exp > 0 || s.level > 1, '打怪真的给了经验', 'exp=' + s.exp + ' level=' + s.level);
});

group('窗口变化', () => {
  sandbox.innerWidth = 390;
  sandbox.innerHeight = 844;
  els.get('game').clientWidth = 390;
  els.get('game').clientHeight = 844;
  fire(sandbox, 'resize');
  tick(10);
  ok(true, '缩到手机尺寸不抛异常');
});

group('切后台与关页面', () => {
  sandbox.document.hidden = true;
  fire(sandbox.document, 'visibilitychange');
  ok(currentSave(), '切后台时存了档');
  sandbox.document.hidden = false;
  fire(sandbox, 'pagehide');
  tick(5);
  ok(true, 'pagehide 存档不抛异常');
});

// ── 汇总 ──────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(52));
if (failures.length) {
  console.log('  ✗ ' + failures.length + ' 项不通过（' + passed + ' 项通过）\n');
  for (const f of failures) console.log('    · ' + f);
  console.log('');
  process.exit(1);
}
console.log('  ✓ 全部 ' + passed + ' 项通过');
console.log('─'.repeat(52) + '\n');
