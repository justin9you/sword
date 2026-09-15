/**
 * 无依赖小工具：随机、数学、ID。
 * 刻意不引入任何库——整个项目零第三方依赖。
 */
(function (global) {
  'use strict';

  var ZX = (global.ZX = global.ZX || {});

  var seq = 0;

  var U = (ZX.U = {
    /** 自增 ID。存档里只存数值，不存对象引用 */
    uid: function () {
      seq += 1;
      return seq;
    },
    /** 让读档后的新实体 ID 不和存档里的撞上 */
    seedUid: function (n) {
      if (n > seq) seq = n;
    },

    clamp: function (v, lo, hi) {
      return v < lo ? lo : v > hi ? hi : v;
    },
    lerp: function (a, b, t) {
      return a + (b - a) * t;
    },
    /** 两点距离 */
    dist: function (ax, ay, bx, by) {
      var dx = bx - ax;
      var dy = by - ay;
      return Math.sqrt(dx * dx + dy * dy);
    },
    /** 距离平方，省一次开方——只比大小的地方用它 */
    dist2: function (ax, ay, bx, by) {
      var dx = bx - ax;
      var dy = by - ay;
      return dx * dx + dy * dy;
    },

    /** [lo, hi) 之间的浮点 */
    rand: function (lo, hi) {
      return lo + Math.random() * (hi - lo);
    },
    /** [lo, hi] 之间的整数 */
    randInt: function (lo, hi) {
      return Math.floor(lo + Math.random() * (hi - lo + 1));
    },
    /** 以 p 的概率返回 true */
    chance: function (p) {
      return Math.random() < p;
    },
    /** 从数组里随机取一个 */
    pick: function (arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    },
    /**
     * 按权重取一个。表的形状是 [{ weight: 3, ... }, ...]。
     * 没有 weight 字段的按 1 算。
     */
    pickWeighted: function (arr) {
      var total = 0;
      var i;
      for (i = 0; i < arr.length; i++) total += arr[i].weight == null ? 1 : arr[i].weight;
      var roll = Math.random() * total;
      for (i = 0; i < arr.length; i++) {
        roll -= arr[i].weight == null ? 1 : arr[i].weight;
        if (roll <= 0) return arr[i];
      }
      return arr[arr.length - 1];
    },

    /**
     * 查表：只认自有属性。
     *
     * 直接写 map[key] 的话，key 是 'constructor' / 'toString' 这类原型上的名字时
     * 会取到 Object.prototype 上的东西——它是真值，于是 `map[key] || 默认值`
     * 的兜底就被短路掉，一个本该退回默认值的坏 key 会带着个函数继续往下跑。
     * 存档是能被手改的，所以所有按 id 查表的地方都走这里。
     */
    own: function (map, key) {
      if (typeof key !== 'string' && typeof key !== 'number') return undefined;
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
    },

    /** 大数字显示成 1.2万 */
    big: function (n) {
      n = Math.floor(n);
      if (n < 10000) return String(n);
      return (n / 10000).toFixed(n < 100000 ? 1 : 0) + '万';
    },

    /** 毫秒 → 1:05 */
    mmss: function (ms) {
      var s = Math.max(0, Math.floor(ms / 1000));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    },
  });

  /** 角度：从 (ax,ay) 指向 (bx,by) 的单位向量，重合时返回朝下 */
  U.dirTo = function (ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.0001) return { x: 0, y: 1 };
    return { x: dx / len, y: dy / len };
  };
})(window);
