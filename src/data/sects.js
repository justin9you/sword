/**
 * 门派（可选职业）与技能树。
 *
 * growth    = 每升一级白给的衍生属性，决定门派的体格差异
 * startBase = 建号时的基础属性，决定手感差异
 * skills    = 按解锁等级排好序；技能面板也按这个顺序画
 *
 * 技能的 kind 决定它怎么打出去，由 skills.js 统一解释：
 *   strike 近身瞬发单体 | bolt 飞行弹丸 | pierce 直线穿透
 *   nova 以自身为圆心 | blast 落点爆炸 | buff 自身增益 | heal 治疗
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  var SECTS = [
    {
      key: 'qingyun',
      name: '青云门',
      art: '太极玄清道',
      color: '#7fc4e8',
      desc: '正道魁首，龙首峰上一脉相承。剑法与道法并重，攻守俱无短板，新手最稳的一条路。',
      quote: '天地不仁，以万物为刍狗。',
      growth: { hp: 9.4, mp: 5.4, atk: 1.45, mag: 1.45, def: 1.05, mdef: 1.0 },
      startBase: { con: 6, spi: 6, agi: 5, wit: 5 },
      skills: [
        { key: 'qy1', name: '太极玄清道·风', lv: 1, mp: 8, cd: 900, kind: 'bolt',
          dmg: 'magic', power: 1.15, speed: 420, range: 300,
          desc: '凝风成刃掷出，青云入门第一诀。' },
        { key: 'qy2', name: '御剑术', lv: 6, mp: 16, cd: 2600, kind: 'pierce',
          dmg: 'phys', power: 1.5, speed: 620, range: 360, width: 26,
          desc: '剑随心动，一道剑光穿透直线上的所有敌人。' },
        { key: 'qy3', name: '太极玄清道·雷', lv: 14, mp: 30, cd: 5200, kind: 'blast',
          dmg: 'magic', power: 1.7, radius: 118, range: 300,
          desc: '引落天雷轰于一点，范围内皆受雷殛。' },
        { key: 'qy4', name: '天琊剑气', lv: 24, mp: 38, cd: 7000, kind: 'strike',
          dmg: 'phys', power: 2.9, range: 110, shield: 0.18, shieldMs: 5000,
          desc: '天琊出鞘，重创当面之敌，剑气同时护住己身。' },
        { key: 'qy5', name: '神剑御雷真诀', lv: 38, mp: 70, cd: 12000, kind: 'nova',
          dmg: 'magic', power: 2.6, radius: 210,
          desc: '青云禁术。周身雷海炸开，伤敌亦耗己之灵力。' },
        { key: 'qy6', name: '诛仙剑阵', lv: 55, mp: 120, cd: 24000, kind: 'nova',
          dmg: 'magic', power: 5.2, radius: 280, stunMs: 1400,
          desc: '诛仙、戮仙、陷仙、绝仙四剑合围，天地为之一暗。' },
      ],
    },
    {
      key: 'tianyin',
      name: '天音寺',
      art: '大梵般若',
      color: '#e8c87f',
      desc: '佛门正宗，以慈悲为怀。气血厚、法防高，带护盾与治疗，扛得住也活得久。',
      quote: '我不入地狱，谁入地狱。',
      growth: { hp: 12.6, mp: 5.0, atk: 1.25, mag: 1.35, def: 1.5, mdef: 1.35 },
      startBase: { con: 9, spi: 6, agi: 3, wit: 4 },
      skills: [
        { key: 'ty1', name: '降魔杵', lv: 1, mp: 7, cd: 1000, kind: 'strike',
          dmg: 'phys', power: 1.35, range: 86,
          desc: '一杵砸下，浑厚朴实，专破邪祟。' },
        { key: 'ty2', name: '大梵般若', lv: 8, mp: 22, cd: 9000, kind: 'buff',
          shield: 0.32, shieldMs: 9000, buffDef: 0.25, buffMs: 9000,
          desc: '梵光护体，吸收伤害并短时提升防御。' },
        { key: 'ty3', name: '舍利元光', lv: 16, mp: 34, cd: 8000, kind: 'heal',
          heal: 0.3, healFlat: 60,
          desc: '舍利子化作暖光，回复大量气血。' },
        { key: 'ty4', name: '天龙禅唱', lv: 26, mp: 44, cd: 9500, kind: 'nova',
          dmg: 'magic', power: 1.5, radius: 200, slow: 0.45, slowMs: 3500,
          desc: '禅唱如钟，震慑四方，来犯者步履沉重。' },
        { key: 'ty5', name: '般若光轮', lv: 40, mp: 66, cd: 11000, kind: 'blast',
          dmg: 'magic', power: 3.0, radius: 150, range: 280,
          desc: '光轮掷出，落地绽作金莲。' },
        { key: 'ty6', name: '梵音渡魂', lv: 55, mp: 110, cd: 26000, kind: 'buff',
          shield: 0.6, shieldMs: 10000, heal: 0.45, buffDef: 0.4, buffMs: 10000,
          desc: '天音寺不传之秘。渡人渡己，重伤之际可挽狂澜。' },
      ],
    },
    {
      key: 'fenxiang',
      name: '焚香谷',
      art: '离火玄功',
      color: '#f08a5d',
      desc: '三大派之一，专修火法。爆发极高、范围极大，但身板偏脆，站位就是活路。',
      quote: '玄火之下，寸草不生。',
      growth: { hp: 7.6, mp: 7.2, atk: 1.1, mag: 2.05, def: 0.8, mdef: 1.1 },
      startBase: { con: 4, spi: 10, agi: 4, wit: 6 },
      skills: [
        { key: 'fx1', name: '离火诀', lv: 1, mp: 9, cd: 850, kind: 'bolt',
          dmg: 'magic', power: 1.3, speed: 400, range: 330, burn: 0.12, burnMs: 3000,
          desc: '一团离火掷出，附带灼烧。' },
        { key: 'fx2', name: '焚香引', lv: 8, mp: 20, cd: 4200, kind: 'blast',
          dmg: 'magic', power: 1.2, radius: 120, range: 300, burn: 0.3, burnMs: 6000,
          desc: '香引落处火种蔓延，持续灼烧范围内敌人。' },
        { key: 'fx3', name: '八凶玄火阵', lv: 18, mp: 46, cd: 8500, kind: 'blast',
          dmg: 'magic', power: 2.7, radius: 175, range: 260, burn: 0.25, burnMs: 5000,
          desc: '焚香谷镇谷大阵的简化式，落点化作一片火海。' },
        { key: 'fx4', name: '朱雀环', lv: 28, mp: 52, cd: 7600, kind: 'nova',
          dmg: 'magic', power: 2.4, radius: 190, knock: 120,
          desc: '朱雀虚影绕身而飞，焚尽近旁并将其震开。' },
        { key: 'fx5', name: '烈火燎原', lv: 42, mp: 78, cd: 12500, kind: 'pierce',
          dmg: 'magic', power: 3.4, speed: 520, range: 420, width: 90, burn: 0.35, burnMs: 6000,
          desc: '烈焰呈扇形推出，一路烧到尽头。' },
        { key: 'fx6', name: '玄火焚天', lv: 56, mp: 125, cd: 25000, kind: 'nova',
          dmg: 'magic', power: 5.6, radius: 300, burn: 0.5, burnMs: 8000,
          desc: '引动玄火鉴真意，方圆之内尽成焦土。' },
      ],
    },
    {
      key: 'guiwang',
      name: '鬼王宗',
      art: '噬血玄功',
      color: '#c96a9b',
      desc: '魔教第一大宗。以血换力，吸血续航极强；血线越低伤害越高，越险越狠。',
      quote: '魔非魔，道非道，善恶只在一念间。',
      growth: { hp: 9.8, mp: 5.0, atk: 1.85, mag: 1.3, def: 1.0, mdef: 0.85 },
      startBase: { con: 7, spi: 4, agi: 8, wit: 3 },
      skills: [
        { key: 'gw1', name: '噬魂爪', lv: 1, mp: 7, cd: 820, kind: 'strike',
          dmg: 'phys', power: 1.2, range: 84, lifesteal: 0.18,
          desc: '黑气化爪撕开血肉，伤害转化为自身气血。' },
        { key: 'gw2', name: '血炼术', lv: 8, mp: 10, cd: 10000, kind: 'buff',
          costHp: 0.12, buffAtk: 0.35, buffMs: 10000,
          desc: '燃烧自身精血，换取一段时间的暴涨攻击。' },
        { key: 'gw3', name: '幽姬双刃', lv: 18, mp: 30, cd: 5000, kind: 'strike',
          dmg: 'phys', power: 1.5, range: 100, hits: 3, lifesteal: 0.12,
          desc: '双刃连挥三记，快到只见残影。' },
        { key: 'gw4', name: '摄魂', lv: 28, mp: 42, cd: 9000, kind: 'blast',
          dmg: 'magic', power: 1.8, radius: 140, range: 280, stunMs: 2200,
          desc: '摄人心魄，中者定在原地动弹不得。' },
        { key: 'gw5', name: '万鬼噬身', lv: 42, mp: 72, cd: 12000, kind: 'nova',
          dmg: 'phys', power: 3.1, radius: 200, lifesteal: 0.3,
          desc: '万千怨鬼自地底涌出，噬敌饲主。' },
        { key: 'gw6', name: '鬼王古剑', lv: 56, mp: 118, cd: 24000, kind: 'pierce',
          dmg: 'phys', power: 6.0, speed: 700, range: 460, width: 70, lifesteal: 0.25,
          desc: '鬼王宗镇宗之剑，一往无前，血气冲天。' },
      ],
    },
  ];

  var byKey = {};
  for (var i = 0; i < SECTS.length; i++) byKey[SECTS[i].key] = SECTS[i];

  var skillIndex = {};
  for (var s = 0; s < SECTS.length; s++) {
    var ss = SECTS[s].skills;
    for (var j = 0; j < ss.length; j++) {
      ss[j].sect = SECTS[s].key;
      ss[j].color = SECTS[s].color;
      skillIndex[ss[j].key] = ss[j];
    }
  }

  ZX.SECTS = SECTS;

  ZX.sect = function (key) {
    return byKey[key] || SECTS[0];
  };

  /** 某门派在 level 级时已解锁的技能 */
  ZX.skillsOf = function (sectKey, level) {
    var list = ZX.sect(sectKey).skills;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].lv <= level) out.push(list[i]);
    }
    return out;
  };

  /** 按 key 查技能定义（跨门派） */
  ZX.skillDef = function (key) {
    return skillIndex[key] || null;
  };
})(window);
