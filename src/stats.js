/**
 * 属性体系与等级曲线。
 *
 * 分两层：
 *   基础属性（玩家看得见、能加点）——体质 / 灵根 / 身法 / 悟性
 *   衍生属性（打架真正用的）——气血 / 灵力 / 攻击 / 法力 / 防御 / 法防 / 暴击 / 闪避
 * 装备只加衍生属性，加点只加基础属性，互不干扰，数值好调。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var CFG = ZX.CONFIG;

  var BASE_KEYS = ['con', 'spi', 'agi', 'wit'];

  var BASE_NAMES = {
    con: '体质',
    spi: '灵根',
    agi: '身法',
    wit: '悟性',
  };

  var DERIVED_NAMES = {
    hp: '气血',
    mp: '灵力',
    atk: '攻击',
    mag: '法力',
    def: '防御',
    mdef: '法防',
    crit: '暴击',
    dodge: '闪避',
    speed: '移速',
    lifesteal: '吸血',
    expBonus: '悟性加成',
  };

  /** 升到下一级需要的经验。指数略高于线性，后期靠精英怪和任务 */
  function expToNext(level) {
    if (level >= CFG.MAX_LEVEL) return Infinity;
    return Math.floor(52 * Math.pow(level, 1.62) + 42 * level + 60);
  }

  /**
   * 基础属性 → 衍生属性。
   * 这套换算是全局唯一的，怪物也走同一套，保证玩家和怪物在同一个数值尺度上。
   */
  function derive(level, base, sect) {
    var g = sect ? sect.growth : { hp: 9, mp: 5, atk: 1.4, mag: 1.4, def: 1.0, mdef: 1.0 };
    return {
      hp: Math.floor(120 + level * g.hp + base.con * 11),
      mp: Math.floor(60 + level * g.mp + base.spi * 8),
      atk: Math.floor(8 + level * g.atk + base.con * 0.6 + base.agi * 0.9),
      mag: Math.floor(8 + level * g.mag + base.spi * 1.7),
      def: Math.floor(4 + level * g.def + base.con * 0.8),
      mdef: Math.floor(4 + level * g.mdef + base.spi * 0.7),
      crit: 0.03 + base.agi * 0.0035 + base.wit * 0.001,
      dodge: 0.02 + base.agi * 0.003,
      speed: 0,
      lifesteal: 0,
      expBonus: base.wit * 0.006,
    };
  }

  /** 空的衍生属性表，用来累加装备加成 */
  function emptyDerived() {
    return {
      hp: 0, mp: 0, atk: 0, mag: 0, def: 0, mdef: 0,
      crit: 0, dodge: 0, speed: 0, lifesteal: 0, expBonus: 0,
    };
  }

  /** b 累加进 a（原地改 a，调用方自己保证 a 是新对象） */
  function addInto(a, b) {
    if (!b) return a;
    for (var k in b) {
      if (Object.prototype.hasOwnProperty.call(b, k) && typeof b[k] === 'number') {
        a[k] = (a[k] || 0) + b[k];
      }
    }
    return a;
  }

  /** 属性显示成字符串：百分比类的转成 12.5% */
  var PERCENT_KEYS = { crit: 1, dodge: 1, lifesteal: 1, expBonus: 1 };
  function fmt(key, value) {
    if (PERCENT_KEYS[key]) return (value * 100).toFixed(1) + '%';
    if (key === 'speed') return (value >= 0 ? '+' : '') + Math.round(value) + '';
    return String(Math.floor(value));
  }

  ZX.Stats = {
    BASE_KEYS: BASE_KEYS,
    BASE_NAMES: BASE_NAMES,
    DERIVED_NAMES: DERIVED_NAMES,
    PERCENT_KEYS: PERCENT_KEYS,
    expToNext: expToNext,
    derive: derive,
    emptyDerived: emptyDerived,
    addInto: addInto,
    fmt: fmt,
  };
})(window);
