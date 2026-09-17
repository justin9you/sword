/**
 * 输入：键盘 + 鼠标 + 触屏摇杆。
 *
 * 只负责「收集意图」，不直接改游戏状态——按键动作以事件队列的形式交给 main.js，
 * 这样暂停、打开面板时只要不消费队列就行，不用在各处判断"现在能不能动"。
 *
 * 触屏：左半屏按下即出摇杆（跟手指落点走，不固定位置），右半屏的技能按钮由 ui.js 画。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var U = ZX.U;

  /** 键 → 动作。左右手都照顾到 */
  var KEYMAP = {
    Digit1: 'skill1', Digit2: 'skill2', Digit3: 'skill3',
    Digit4: 'skill4', Digit5: 'skill5', Digit6: 'skill6',
    KeyQ: 'talisman',
    Space: 'attack',
    KeyE: 'interact',
    KeyB: 'bag', KeyI: 'bag',
    KeyC: 'char',
    KeyK: 'skills',
    KeyM: 'map',
    KeyL: 'quest',
    Escape: 'menu',
    KeyR: 'potion',
  };

  var MOVE_KEYS = {
    KeyW: [0, -1], ArrowUp: [0, -1],
    KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0],
    KeyD: [1, 0], ArrowRight: [1, 0],
  };

  function Input(canvas) {
    var self = this;
    this.canvas = canvas;
    this.keys = {};
    this.queue = [];
    this.dir = { x: 0, y: 0 };
    this.aim = { x: 0, y: 0 };      // 屏幕坐标
    this.hasAim = false;
    this.stick = null;              // { id, ox, oy, x, y }
    this.touch = false;

    global.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      // 输入框里打字时不抢键
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;

      if (MOVE_KEYS[e.code] || KEYMAP[e.code]) e.preventDefault();
      self.keys[e.code] = true;
      var action = KEYMAP[e.code];
      if (action) self.queue.push(action);
    });

    global.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
    });

    // 切后台时把按键状态清掉，回来不会一直往一个方向跑
    global.addEventListener('blur', function () {
      self.keys = {};
      self.dir.x = 0;
      self.dir.y = 0;
    });

    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      self.aim.x = e.clientX - r.left;
      self.aim.y = e.clientY - r.top;
      self.hasAim = true;
    });

    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) self.queue.push('attack');
    });

    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      self.queue.push('interact');
    });

    canvas.addEventListener('touchstart', function (e) {
      self.touch = true;
      var r = canvas.getBoundingClientRect();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        var x = t.clientX - r.left;
        var y = t.clientY - r.top;
        // 整块画面都能出摇杆，不再只认左半屏。
        //
        // 原来限死 x < 半屏，结果是手指落在屏幕中线偏右就完全没反应，
        // 而中间恰恰是拇指最自然的落点。右半屏本来也不需要留白：
        // 技能格和 E／药 都是 DOM 按钮，浮在画布之上、自己吃掉触摸，
        // 根本走不到这个监听器里来；HUD 其余部分是 pointer-events: none，
        // 触摸会直接穿透过来——所以整屏可用是安全的。
        if (!self.stick) {
          self.stick = { id: t.identifier, ox: x, oy: y, x: x, y: y };
          e.preventDefault();
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      if (!self.stick) return;
      var r = canvas.getBoundingClientRect();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier !== self.stick.id) continue;
        self.stick.x = t.clientX - r.left;
        self.stick.y = t.clientY - r.top;
        e.preventDefault();
      }
    }, { passive: false });

    function endTouch(e) {
      if (!self.stick) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === self.stick.id) self.stick = null;
      }
    }
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
  }

  /** 每帧算一次移动方向；键盘和摇杆取先有值的那个 */
  Input.prototype.update = function () {
    var dx = 0;
    var dy = 0;

    for (var code in MOVE_KEYS) {
      if (this.keys[code]) {
        dx += MOVE_KEYS[code][0];
        dy += MOVE_KEYS[code][1];
      }
    }

    if (!dx && !dy && this.stick) {
      var sx = this.stick.x - this.stick.ox;
      var sy = this.stick.y - this.stick.oy;
      var len = Math.sqrt(sx * sx + sy * sy);
      var DEAD = 12;
      var MAX = 58;
      if (len > DEAD) {
        var k = Math.min(1, (len - DEAD) / (MAX - DEAD));
        dx = (sx / len) * k;
        dy = (sy / len) * k;
      }
    }

    var m = Math.sqrt(dx * dx + dy * dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    this.dir.x = dx;
    this.dir.y = dy;
    return this.dir;
  };

  /** 取出并清空这一帧的动作 */
  Input.prototype.drain = function () {
    var q = this.queue;
    this.queue = [];
    return q;
  };

  Input.prototype.clear = function () {
    this.queue.length = 0;
  };

  /** UI 上的虚拟按钮也走同一个队列 */
  Input.prototype.press = function (action) {
    this.queue.push(action);
  };

  /**
   * 瞄准点（世界坐标）。
   * 鼠标就用鼠标位置；触屏没有指针，用移动方向前方一点，没在动就用朝向。
   */
  Input.prototype.aimWorld = function (renderer, player) {
    if (this.hasAim && !this.touch) {
      return renderer.screenToWorld(this.aim.x, this.aim.y);
    }
    var d = (this.dir.x || this.dir.y) ? this.dir : player.facing;
    return { x: player.x + d.x * 220, y: player.y + d.y * 220 };
  };

  /** 摇杆的屏幕位置，给 render/ui 画出来 */
  Input.prototype.stickView = function () {
    if (!this.stick) return null;
    var sx = this.stick.x - this.stick.ox;
    var sy = this.stick.y - this.stick.oy;
    var len = Math.sqrt(sx * sx + sy * sy);
    var MAX = 58;
    if (len > MAX) {
      sx = (sx / len) * MAX;
      sy = (sy / len) * MAX;
    }
    return { ox: this.stick.ox, oy: this.stick.oy, x: this.stick.ox + sx, y: this.stick.oy + sy };
  };

  ZX.Input = Input;
  ZX.KEYMAP = KEYMAP;
})(window);
