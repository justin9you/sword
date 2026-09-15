/**
 * 背包与装备栏。
 *
 * 装备没有随机词缀，所以背包里只需要存 { id, n }，不用存整个物品对象——
 * 存档体积小，读档也不会因为改过数值表而失效。
 *
 * 所有方法都返回新数组/新对象，不在原地改（immutable），
 * 这样 UI 只要比对象引用就知道要不要重绘。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var CFG = ZX.CONFIG;

  function emptyBag() {
    var bag = [];
    for (var i = 0; i < CFG.BAG_SIZE; i++) bag.push(null);
    return bag;
  }

  function emptyEquip() {
    var e = {};
    for (var i = 0; i < ZX.SLOTS.length; i++) e[ZX.SLOTS[i].key] = null;
    return e;
  }

  /** 背包里这件物品一共有几个 */
  function count(bag, id) {
    var n = 0;
    for (var i = 0; i < bag.length; i++) {
      if (bag[i] && bag[i].id === id) n += bag[i].n;
    }
    return n;
  }

  function firstEmpty(bag) {
    for (var i = 0; i < bag.length; i++) {
      if (!bag[i]) return i;
    }
    return -1;
  }

  /**
   * 放进背包。
   * 返回 { bag, added }：added 是真正放进去的数量，背包满了会小于 n。
   */
  function add(bag, id, n) {
    var item = ZX.ITEMS.byId(id);
    if (!item) return { bag: bag, added: 0 };
    n = n || 1;

    var next = bag.slice();
    var added = 0;
    var i;

    // 先堆叠
    if (item.stackable) {
      for (i = 0; i < next.length && n > 0; i++) {
        var s = next[i];
        if (s && s.id === id && s.n < CFG.STACK_MAX) {
          var room = Math.min(CFG.STACK_MAX - s.n, n);
          next[i] = { id: id, n: s.n + room };
          n -= room;
          added += room;
        }
      }
    }

    // 再占空格
    while (n > 0) {
      var slot = firstEmpty(next);
      if (slot < 0) break;
      var put = item.stackable ? Math.min(CFG.STACK_MAX, n) : 1;
      next[slot] = { id: id, n: put };
      n -= put;
      added += put;
    }

    return { bag: next, added: added };
  }

  /** 从指定格子拿走 n 个 */
  function removeAt(bag, index, n) {
    if (index < 0 || index >= bag.length || !bag[index]) return bag;
    n = n || 1;
    var next = bag.slice();
    var left = next[index].n - n;
    next[index] = left > 0 ? { id: next[index].id, n: left } : null;
    return next;
  }

  /** 按 id 扣除 n 个（跨格子），不够扣就什么都不做并返回 null */
  function removeById(bag, id, n) {
    n = n || 1;
    if (count(bag, id) < n) return null;
    var next = bag.slice();
    for (var i = 0; i < next.length && n > 0; i++) {
      if (next[i] && next[i].id === id) {
        var take = Math.min(next[i].n, n);
        var left = next[i].n - take;
        next[i] = left > 0 ? { id: id, n: left } : null;
        n -= take;
      }
    }
    return next;
  }

  function isFull(bag) {
    return firstEmpty(bag) < 0;
  }

  /**
   * 穿装备：背包第 index 格的东西换到对应槽位，原来穿着的退回那一格。
   * 返回 null 表示穿不上（等级/门派不符，或那格不是装备）。
   */
  function equip(bag, equipped, index, sectKey, level) {
    var stack = bag[index];
    if (!stack) return null;
    var item = ZX.ITEMS.byId(stack.id);
    if (!ZX.ITEMS.canEquip(item, sectKey, level)) return null;

    var nextBag = bag.slice();
    var nextEquip = {};
    for (var k in equipped) {
      if (Object.prototype.hasOwnProperty.call(equipped, k)) nextEquip[k] = equipped[k];
    }

    var old = nextEquip[item.slot];
    nextEquip[item.slot] = item.id;
    // 换下来的旧装备正好占回刚空出来的那一格
    nextBag[index] = old ? { id: old, n: 1 } : null;

    return { bag: nextBag, equip: nextEquip, item: item, replaced: old ? ZX.ITEMS.byId(old) : null };
  }

  /** 脱下某个槽位，退回背包。背包满了就脱不下来 */
  function unequip(bag, equipped, slotKey) {
    var id = equipped[slotKey];
    if (!id) return null;
    if (isFull(bag)) return null;

    var res = add(bag, id, 1);
    var nextEquip = {};
    for (var k in equipped) {
      if (Object.prototype.hasOwnProperty.call(equipped, k)) nextEquip[k] = equipped[k];
    }
    nextEquip[slotKey] = null;
    return { bag: res.bag, equip: nextEquip };
  }

  /** 全身装备的属性合计 */
  function equipStats(equipped) {
    var total = ZX.Stats.emptyDerived();
    for (var k in equipped) {
      if (!Object.prototype.hasOwnProperty.call(equipped, k)) continue;
      var item = ZX.ITEMS.byId(equipped[k]);
      if (item) ZX.Stats.addInto(total, item.stats);
    }
    return total;
  }

  /** 当前装着的法宝（决定主动技第 6 格），没有就返回 null */
  function talisman(equipped) {
    return ZX.ITEMS.byId(equipped.talisman);
  }

  ZX.Inventory = {
    emptyBag: emptyBag,
    emptyEquip: emptyEquip,
    count: count,
    firstEmpty: firstEmpty,
    isFull: isFull,
    add: add,
    removeAt: removeAt,
    removeById: removeById,
    equip: equip,
    unequip: unequip,
    equipStats: equipStats,
    talisman: talisman,
  };
})(window);
