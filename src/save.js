/**
 * 本地存档。
 *
 * localStorage 在无痕模式 / 存储被清 / 配额满时都会抛异常，所以每次读写都兜住，
 * 失败就退化成"本次会话内存存档"，游戏照常进行（只是关掉页面就没了）。
 *
 * 存档只放"不可再生"的数据：等级、加点、背包 id、任务进度。
 * 属性、技能列表这些能算出来的一律不存——改了数值表，老存档也不会崩。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var KEY = 'zx.save.v1';
  var SETTINGS_KEY = 'zx.settings.v1';

  var memo = null;      // localStorage 不可用时的兜底
  var memoOnly = false; // 上一次写盘失败过——此时内存副本才是最新的

  function serialize(p) {
    return {
      v: 1,
      name: p.name,
      sect: p.sect,
      level: p.level,
      exp: p.exp,
      gold: p.gold,
      points: p.points,
      base: p.base,
      bag: p.bag,
      equip: p.equip,
      map: p.map,
      hp: Math.round(p.hp),
      mp: Math.round(p.mp),
      quest: p.quest,
      visited: p.visited,
      kills: p.kills,
      deaths: p.deaths,
      playMs: Math.round(p.playMs),
      at: Date.now(),
    };
  }

  /** 读档时逐字段校验：存档可能来自旧版本，也可能被手改坏了 */
  function deserialize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.sect || !raw.name) return null;

    var p = ZX.Player.create(String(raw.name).slice(0, 12), raw.sect);
    p.level = clampInt(raw.level, 1, ZX.CONFIG.MAX_LEVEL);
    p.exp = Math.max(0, num(raw.exp));
    p.gold = Math.max(0, num(raw.gold));
    p.points = Math.max(0, num(raw.points));

    if (raw.base) {
      for (var i = 0; i < ZX.Stats.BASE_KEYS.length; i++) {
        var k = ZX.Stats.BASE_KEYS[i];
        if (typeof raw.base[k] === 'number') p.base[k] = clampInt(raw.base[k], 0, 9999);
      }
    }

    // 背包：格子数以当前配置为准，未知物品 id 直接丢掉
    var bag = ZX.Inventory.emptyBag();
    if (Array.isArray(raw.bag)) {
      for (var j = 0; j < bag.length && j < raw.bag.length; j++) {
        var s = raw.bag[j];
        if (s && ZX.ITEMS.byId(s.id)) {
          bag[j] = { id: s.id, n: clampInt(s.n, 1, ZX.CONFIG.STACK_MAX) };
        }
      }
    }
    p.bag = bag;

    // 装备：校验物品存在、槽位对得上、穿得起
    var equip = ZX.Inventory.emptyEquip();
    if (raw.equip) {
      for (var slotKey in equip) {
        if (!Object.prototype.hasOwnProperty.call(equip, slotKey)) continue;
        var item = ZX.ITEMS.byId(raw.equip[slotKey]);
        if (item && item.slot === slotKey && ZX.ITEMS.canEquip(item, p.sect, p.level)) {
          equip[slotKey] = item.id;
        }
      }
    }
    p.equip = equip;

    p.map = ZX.MAPS.byKey(raw.map).key;
    p.visited = (raw.visited && typeof raw.visited === 'object') ? raw.visited : { caomiao: true };
    p.visited[p.map] = true;

    if (raw.quest && typeof raw.quest === 'object') {
      var cur = raw.quest.current;
      p.quest = {
        current: (cur && ZX.QUESTS.byKey(cur)) ? cur : (cur === null ? null : 'q1'),
        progress: Math.max(0, num(raw.quest.progress)),
        done: (raw.quest.done && typeof raw.quest.done === 'object') ? raw.quest.done : {},
      };
    }

    p.kills = Math.max(0, num(raw.kills));
    p.deaths = Math.max(0, num(raw.deaths));
    p.playMs = Math.max(0, num(raw.playMs));

    ZX.Player.recompute(p);
    p.hp = clampInt(raw.hp, 1, p.stats.hp) || p.stats.hp;
    p.mp = clampInt(raw.mp, 0, p.stats.mp);
    return p;
  }

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  function clampInt(v, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, Math.floor(v)));
  }

  function save(p) {
    var data = serialize(p);
    memo = data;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
      memoOnly = false;
      return true;
    } catch (e) {
      memoOnly = true; // 存不下就只留内存版，不打断游戏
      return false;
    }
  }

  /**
   * 取原始存档。
   * 正常情况下以 localStorage 为准（别的标签页存过的也能读到）；
   * 只有上一次写盘失败时，内存副本才是更新的那份。
   */
  function readRaw() {
    if (memoOnly && memo) return memo;
    try {
      var text = global.localStorage.getItem(KEY);
      if (text) return JSON.parse(text);
    } catch (e) {
      // 读不出来就退回内存副本
    }
    return memo;
  }

  function load() {
    var raw = readRaw();
    if (!raw) return null;
    try {
      return deserialize(raw);
    } catch (e) {
      return null; // 存档结构坏了就当没有，总好过白屏
    }
  }

  function hasSave() {
    return !!readRaw();
  }

  function wipe() {
    memo = null;
    memoOnly = false;
    try {
      global.localStorage.removeItem(KEY);
    } catch (e) {
      // 清不掉就算了
    }
  }

  /** 摘要，给标题页的"继续游戏"按钮显示 */
  function summary() {
    var raw = readRaw();
    if (!raw || !raw.sect) return null;
    return {
      name: raw.name,
      sect: ZX.sect(raw.sect).name,
      level: raw.level,
      map: ZX.MAPS.byKey(raw.map).name,
    };
  }

  // ── 设置（音效开关等）独立存，换号不丢 ──────────────
  function loadSettings() {
    try {
      var t = global.localStorage.getItem(SETTINGS_KEY);
      var o = t ? JSON.parse(t) : null;
      return { sound: !o || o.sound !== false };
    } catch (e) {
      return { sound: true };
    }
  }

  function saveSettings(s) {
    try {
      global.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      // 忽略
    }
  }

  ZX.Save = {
    save: save,
    load: load,
    hasSave: hasSave,
    wipe: wipe,
    summary: summary,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
  };
})(window);
