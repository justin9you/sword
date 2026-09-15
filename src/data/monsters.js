/**
 * 怪物图鉴。
 *
 * 属性不逐只手写，而是由「等级 × 定位倍率」算出来——这样调一次 ROLE 表，
 * 全世界的难度曲线一起动，不用回来改四十个数字。
 *
 * role  决定体格：weak 杂鱼 / normal 常规 / brute 皮糙肉厚 / swift 快而脆
 *                 caster 远程 / elite 精英 / boss 首领
 * art   决定长相，由 art.js 画：beast 四足兽 / snake 蛇 / bat 蝠 / bird 禽
 *                 ghost 幽魂 / skeleton 骨 / humanoid 人形 / insect 虫
 *                 plant 草木精 / golem 石傀儡 / fox 狐 / zombie 尸
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  /** hp/atk/def 是相对常规怪的倍率；exp/gold 同理 */
  var ROLE = {
    weak: { hp: 0.6, atk: 0.7, def: 0.6, speed: 74, exp: 0.6, gold: 0.6, r: 15, ranged: false },
    normal: { hp: 1, atk: 1, def: 1, speed: 86, exp: 1, gold: 1, r: 18, ranged: false },
    brute: { hp: 2.1, atk: 1.25, def: 1.8, speed: 62, exp: 1.6, gold: 1.5, r: 24, ranged: false },
    swift: { hp: 0.7, atk: 1.15, def: 0.7, speed: 138, exp: 1.1, gold: 1, r: 15, ranged: false },
    caster: { hp: 0.85, atk: 1.35, def: 0.8, speed: 70, exp: 1.3, gold: 1.4, r: 17, ranged: true },
    elite: { hp: 3.6, atk: 1.6, def: 2.0, speed: 92, exp: 3.4, gold: 3.2, r: 27, ranged: false },
    boss: { hp: 14, atk: 2.1, def: 2.6, speed: 84, exp: 16, gold: 14, r: 40, ranged: false },
  };

  var LIST = [
    // ── 草庙村外 ────────────────────────────────────────────
    { id: 'yegou', name: '野狗', lv: 1, role: 'weak', art: 'beast', color: '#9a8064' },
    { id: 'shanzhu', name: '山猪', lv: 2, role: 'normal', art: 'beast', color: '#7a6250' },
    { id: 'qingshe', name: '青蛇', lv: 3, role: 'swift', art: 'snake', color: '#5f9e63' },
    { id: 'shanzei', name: '山贼', lv: 4, role: 'normal', art: 'humanoid', color: '#8a5f4a' },
    { id: 'toulang', name: '头狼', lv: 5, role: 'elite', art: 'beast', color: '#6f6f7a' },

    // ── 青云山·龙首峰 ──────────────────────────────────────
    { id: 'linghou', name: '灵猴', lv: 5, role: 'swift', art: 'beast', color: '#a4794f' },
    { id: 'chilu', name: '赤鹿', lv: 6, role: 'normal', art: 'beast', color: '#b3623c' },
    { id: 'duzhufeng', name: '毒蜂', lv: 7, role: 'swift', art: 'insect', color: '#d8c04a' },
    { id: 'shanxiao', name: '山魈', lv: 8, role: 'brute', art: 'humanoid', color: '#6b5a76' },
    { id: 'shoujing', name: '兽精', lv: 9, role: 'elite', art: 'beast', color: '#8a5f9e' },

    // ── 大竹峰 ─────────────────────────────────────────────
    { id: 'zhuyeqing_m', name: '竹叶青', lv: 9, role: 'swift', art: 'snake', color: '#69b06a' },
    { id: 'zhuyao', name: '竹妖', lv: 11, role: 'normal', art: 'plant', color: '#7fae5e' },
    { id: 'jumang', name: '巨蟒', lv: 12, role: 'brute', art: 'snake', color: '#4f7a55' },
    { id: 'shanyuan', name: '山猿', lv: 13, role: 'normal', art: 'beast', color: '#8d7355' },
    { id: 'qiannianzhuyao', name: '千年竹妖', lv: 14, role: 'boss', art: 'plant', color: '#3f8a4a',
      title: '大竹峰后山', say: '此山……此竹……皆为我身……' },

    // ── 空桑山·滴血洞 ─────────────────────────────────────
    { id: 'xuebian', name: '血蝠', lv: 14, role: 'swift', art: 'bat', color: '#9e4a52' },
    { id: 'shikuilei', name: '石傀儡', lv: 16, role: 'brute', art: 'golem', color: '#6e6e6e' },
    { id: 'xuezhi', name: '血蛭', lv: 17, role: 'normal', art: 'insect', color: '#8b3a44' },
    { id: 'heishuixiaoshe', name: '黑水玄蛇', lv: 19, role: 'elite', art: 'snake', color: '#3c4a6e' },
    { id: 'xuanshe_wang', name: '黑水玄蛇王', lv: 21, role: 'boss', art: 'snake', color: '#2b3a5e',
      title: '滴血洞守护', say: '嘶——（洞底深处，有什么在看着你）' },

    // ── 死灵渊 ─────────────────────────────────────────────
    { id: 'youhun', name: '幽魂', lv: 22, role: 'swift', art: 'ghost', color: '#7fa8c4' },
    { id: 'baigu', name: '白骨兵', lv: 23, role: 'normal', art: 'skeleton', color: '#cfc9b8' },
    { id: 'shihunshou', name: '噬魂兽', lv: 25, role: 'brute', art: 'beast', color: '#4a4a63' },
    { id: 'silingfashi', name: '死灵法师', lv: 26, role: 'caster', art: 'humanoid', color: '#5e4a7a' },
    { id: 'shoushen', name: '兽神', lv: 30, role: 'boss', art: 'beast', color: '#7a3b4a',
      title: '四灵血阵', say: '千年了……总算有人肯放我出来。' },

    // ── 万蝠古窟 ───────────────────────────────────────────
    { id: 'wannianxuebian', name: '万年血蝠', lv: 29, role: 'swift', art: 'bat', color: '#7a2f3a' },
    { id: 'shimo', name: '尸魔', lv: 31, role: 'brute', art: 'zombie', color: '#5f6b4f' },
    { id: 'xuekuilei', name: '血傀儡', lv: 33, role: 'normal', art: 'golem', color: '#8a4046' },
    { id: 'gukudanei', name: '窟内游尸', lv: 34, role: 'normal', art: 'zombie', color: '#6b6352' },
    { id: 'heixinlaoren', name: '黑心老人', lv: 37, role: 'boss', art: 'humanoid', color: '#4a3a5e',
      title: '万蝠古窟主', say: '嘿嘿，年轻人，你身上这股血气……借老夫尝尝？' },

    // ── 焚香谷 ─────────────────────────────────────────────
    { id: 'huoqilin', name: '火麒麟', lv: 35, role: 'brute', art: 'beast', color: '#d9622f' },
    { id: 'yanmo', name: '炎魔', lv: 37, role: 'normal', art: 'humanoid', color: '#c4452f' },
    { id: 'zhuque', name: '朱雀', lv: 39, role: 'caster', art: 'bird', color: '#e8743f' },
    { id: 'xuanhuowei', name: '玄火卫', lv: 40, role: 'elite', art: 'golem', color: '#b0512f' },
    { id: 'yunyilan', name: '云易岚', lv: 43, role: 'boss', art: 'humanoid', color: '#e0803f',
      title: '焚香谷主', say: '正邪之分，从来不在门派，在人心。可惜——你我都晚了。' },

    // ── 狐岐山 ─────────────────────────────────────────────
    { id: 'huyao', name: '狐妖', lv: 41, role: 'swift', art: 'fox', color: '#d9a15e' },
    { id: 'jiuweiyou', name: '九尾幼狐', lv: 43, role: 'caster', art: 'fox', color: '#e8d3a0' },
    { id: 'shanling', name: '山灵', lv: 44, role: 'normal', art: 'plant', color: '#6fa87a' },
    { id: 'huqishou', name: '狐岐守卫', lv: 46, role: 'elite', art: 'golem', color: '#8a7a5e' },
    { id: 'xiaobai', name: '小白', lv: 48, role: 'boss', art: 'fox', color: '#f0ece0',
      title: '九尾天狐', say: '你要玄火鉴？拿走便是。反正她也不会醒了……对么？' },

    // ── 南疆蛮荒 ───────────────────────────────────────────
    { id: 'guchong', name: '蛊虫', lv: 46, role: 'weak', art: 'insect', color: '#7a9e4a' },
    { id: 'qiweiwugong_m', name: '七尾蜈蚣', lv: 48, role: 'brute', art: 'insect', color: '#9e6a2f' },
    { id: 'wuji', name: '苗疆巫祭', lv: 50, role: 'caster', art: 'humanoid', color: '#4a7a6e' },
    { id: 'manhuangshou', name: '蛮荒兽', lv: 51, role: 'elite', art: 'beast', color: '#6b4a3a' },
    { id: 'shoushenshizhe', name: '兽神使者', lv: 53, role: 'boss', art: 'beast', color: '#8a3f5e',
      title: '南疆蛮荒', say: '兽神不死。你杀得完血阵，杀不完人心里的那点贪。' },

    // ── 鬼王宗 ─────────────────────────────────────────────
    { id: 'guizu', name: '鬼卒', lv: 52, role: 'normal', art: 'humanoid', color: '#5e4a6b' },
    { id: 'youjiwei', name: '幽姬卫', lv: 54, role: 'swift', art: 'humanoid', color: '#8a5f9e' },
    { id: 'mojiaozhanglao', name: '魔教长老', lv: 55, role: 'caster', art: 'humanoid', color: '#6b3a5e' },
    { id: 'xuelian', name: '血炼尸傀', lv: 56, role: 'elite', art: 'zombie', color: '#8a3a44' },
    { id: 'guiwang', name: '鬼王', lv: 58, role: 'boss', art: 'humanoid', color: '#a03f6e',
      title: '鬼王宗宗主', say: '我这一生，只想救一个人。为此杀多少人，都无所谓。' },

    // ── 通天峰 ─────────────────────────────────────────────
    { id: 'qingyunjianshi', name: '青云剑侍', lv: 57, role: 'normal', art: 'humanoid', color: '#7fa8c4' },
    { id: 'hufazhanglao', name: '护法长老', lv: 59, role: 'caster', art: 'humanoid', color: '#5e8aa8' },
    { id: 'zhuxianjianling', name: '诛仙剑灵', lv: 61, role: 'elite', art: 'ghost', color: '#a8c4e0' },
    { id: 'jianzhen', name: '剑阵虚影', lv: 62, role: 'swift', art: 'ghost', color: '#c4d8ec' },
    { id: 'daoxuan', name: '道玄真人', lv: 65, role: 'boss', art: 'humanoid', color: '#e0e8f0',
      title: '青云门掌门', say: '天地不仁，以万物为刍狗……小凡，为师错了么？' },
  ];

  var byId = {};

  for (var i = 0; i < LIST.length; i++) {
    var m = LIST[i];
    var r = ROLE[m.role];
    var lv = m.lv;

    // 和 stats.js 的玩家换算保持同一个尺度：怪物血量略高于同级玩家，伤害略低
    m.maxHp = Math.floor((90 + lv * 26 + lv * lv * 1.15) * r.hp);
    m.atk = Math.floor((7 + lv * 2.35) * r.atk);
    m.def = Math.floor((2 + lv * 1.05) * r.def);
    m.mdef = Math.floor((2 + lv * 0.95) * r.def);
    m.speed = r.speed;
    m.radius = r.r;
    m.ranged = r.ranged;
    m.exp = Math.floor((13 + lv * 7.5 + lv * lv * 0.5) * r.exp);
    m.gold = Math.floor((4 + lv * 2.6) * r.gold);
    m.isBoss = m.role === 'boss';
    m.isElite = m.role === 'elite' || m.isBoss;
    /** 攻击间隔（毫秒）——Boss 压得更紧 */
    m.atkMs = m.isBoss ? 1150 : r.ranged ? 1700 : 1350;
    m.attackRange = r.ranged ? 300 : 20 + r.r;
    byId[m.id] = m;
  }

  ZX.MONSTERS = {
    all: LIST,
    byId: function (id) {
      return ZX.U.own(byId, id) || null;
    },
    ROLE: ROLE,
  };
})(window);
