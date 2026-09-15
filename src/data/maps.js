/**
 * 场景。坐标单位一律是「格」，渲染时乘 CONFIG.TILE。
 *
 * blocks  手摆的矩形障碍（房屋、巨石、崖壁），碰撞只认它们和地图边界——
 *         规则简单才跑得稳，不搞逐格地形。
 * decor   装饰散点的数量，由 art.js 用地图 key 做种子随机摆放，
 *         所以每次进同一张图，树和石头都长在同一个地方。
 * spawns  刷怪表：怪物 id + 权重 + 这张图同时存活多少只。
 * boss    首领只有一只，死后按 bossRespawnMs 重生。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  var MAPS = [
    {
      key: 'caomiao',
      name: '草庙村',
      sub: '一切开始的地方',
      lv: [1, 5],
      biome: 'village',
      w: 40, h: 30,
      start: { x: 20, y: 24 },
      blocks: [
        { x: 6, y: 6, w: 5, h: 4 }, { x: 15, y: 5, w: 6, h: 4 }, { x: 27, y: 7, w: 5, h: 4 },
        { x: 9, y: 16, w: 4, h: 3 }, { x: 29, y: 17, w: 4, h: 3 },
      ],
      decor: { tree: 26, rock: 10, grass: 70 },
      spawns: [
        { id: 'yegou', weight: 4 }, { id: 'shanzhu', weight: 3 },
        { id: 'qingshe', weight: 2 }, { id: 'shanzei', weight: 2 },
      ],
      count: 14,
      boss: { id: 'toulang', x: 33, y: 5 },
      npcs: ['puzhi', 'linjingyu'],
      portals: [{ to: 'longshou', x: 2, y: 15 }],
    },
    {
      key: 'longshou',
      name: '青云山·龙首峰',
      sub: '七十二盘山道，云在脚下',
      lv: [5, 9],
      biome: 'mountain',
      w: 44, h: 32,
      start: { x: 40, y: 16 },
      blocks: [
        { x: 10, y: 4, w: 8, h: 3 }, { x: 24, y: 6, w: 6, h: 5 }, { x: 6, y: 18, w: 7, h: 4 },
        { x: 30, y: 20, w: 8, h: 4 }, { x: 18, y: 14, w: 4, h: 4 },
      ],
      decor: { tree: 30, rock: 22, cloud: 12 },
      spawns: [
        { id: 'linghou', weight: 4 }, { id: 'chilu', weight: 3 },
        { id: 'duzhufeng', weight: 3 }, { id: 'shanxiao', weight: 2 },
      ],
      count: 16,
      boss: { id: 'shoujing', x: 8, y: 6 },
      npcs: ['tianbuyi'],
      portals: [{ to: 'caomiao', x: 42, y: 16 }, { to: 'dazhu', x: 2, y: 8 }],
    },
    {
      key: 'dazhu',
      name: '大竹峰',
      sub: '七脉之末，烧火十年',
      lv: [9, 14],
      biome: 'bamboo',
      w: 46, h: 34,
      start: { x: 42, y: 26 },
      blocks: [
        { x: 18, y: 10, w: 8, h: 6 }, { x: 8, y: 22, w: 6, h: 4 },
        { x: 32, y: 8, w: 5, h: 4 }, { x: 30, y: 24, w: 7, h: 4 },
      ],
      decor: { bamboo: 60, rock: 8, grass: 40 },
      spawns: [
        { id: 'zhuyeqing_m', weight: 4 }, { id: 'zhuyao', weight: 3 },
        { id: 'jumang', weight: 2 }, { id: 'shanyuan', weight: 3 },
      ],
      count: 18,
      boss: { id: 'qiannianzhuyao', x: 10, y: 6 },
      npcs: ['tianlinger', 'surou', 'songdaren'],
      portals: [
        { to: 'longshou', x: 44, y: 26 },
        { to: 'heyang', x: 23, y: 32 },
        { to: 'dixue', x: 2, y: 4 },
      ],
    },
    {
      key: 'heyang',
      name: '河阳城',
      sub: '人间烟火，买卖不问来路',
      lv: [1, 65],
      biome: 'town',
      safe: true,
      w: 40, h: 28,
      start: { x: 20, y: 22 },
      blocks: [
        { x: 5, y: 5, w: 7, h: 5 }, { x: 16, y: 4, w: 8, h: 5 }, { x: 28, y: 5, w: 7, h: 5 },
        { x: 6, y: 14, w: 6, h: 4 }, { x: 28, y: 14, w: 6, h: 4 }, { x: 17, y: 13, w: 6, h: 4 },
      ],
      decor: { lantern: 20, stall: 12, rock: 4 },
      spawns: [],
      count: 0,
      npcs: ['zhouyixian', 'shangren', 'tiejiang'],
      portals: [{ to: 'dazhu', x: 20, y: 26 }, { to: 'siling', x: 2, y: 13 }],
    },
    {
      key: 'dixue',
      name: '空桑山·滴血洞',
      sub: '洞底那滩水，红得不像水',
      lv: [14, 21],
      biome: 'cave',
      w: 42, h: 30,
      start: { x: 38, y: 24 },
      blocks: [
        { x: 8, y: 4, w: 6, h: 6 }, { x: 20, y: 8, w: 5, h: 8 }, { x: 30, y: 4, w: 6, h: 5 },
        { x: 6, y: 18, w: 8, h: 5 }, { x: 26, y: 20, w: 8, h: 5 }, { x: 16, y: 22, w: 5, h: 4 },
      ],
      decor: { stalag: 34, crystal: 14 },
      spawns: [
        { id: 'xuebian', weight: 4 }, { id: 'shikuilei', weight: 2 },
        { id: 'xuezhi', weight: 3 }, { id: 'heishuixiaoshe', weight: 1 },
      ],
      count: 17,
      boss: { id: 'xuanshe_wang', x: 6, y: 6 },
      npcs: [],
      portals: [{ to: 'dazhu', x: 40, y: 24 }],
    },
    {
      key: 'siling',
      name: '死灵渊',
      sub: '四灵血阵，千年不散的怨',
      lv: [22, 30],
      biome: 'dead',
      w: 46, h: 34,
      start: { x: 42, y: 17 },
      blocks: [
        { x: 10, y: 6, w: 7, h: 5 }, { x: 24, y: 5, w: 6, h: 6 }, { x: 34, y: 12, w: 6, h: 5 },
        { x: 8, y: 20, w: 8, h: 5 }, { x: 22, y: 24, w: 9, h: 5 }, { x: 18, y: 14, w: 5, h: 5 },
      ],
      decor: { bone: 30, deadtree: 20, fog: 16 },
      spawns: [
        { id: 'youhun', weight: 4 }, { id: 'baigu', weight: 4 },
        { id: 'shihunshou', weight: 2 }, { id: 'silingfashi', weight: 2 },
      ],
      count: 20,
      boss: { id: 'shoushen', x: 8, y: 8 },
      npcs: ['biyao'],
      portals: [{ to: 'heyang', x: 44, y: 17 }, { to: 'wanfu', x: 2, y: 30 }],
    },
    {
      key: 'wanfu',
      name: '万蝠古窟',
      sub: '头顶密密麻麻，全是眼睛',
      lv: [29, 37],
      biome: 'cave',
      w: 44, h: 32,
      start: { x: 40, y: 27 },
      blocks: [
        { x: 6, y: 5, w: 7, h: 6 }, { x: 18, y: 4, w: 6, h: 7 }, { x: 30, y: 6, w: 7, h: 5 },
        { x: 8, y: 18, w: 9, h: 6 }, { x: 24, y: 18, w: 8, h: 6 }, { x: 34, y: 22, w: 6, h: 5 },
      ],
      decor: { stalag: 40, bat: 24, crystal: 8 },
      spawns: [
        { id: 'wannianxuebian', weight: 4 }, { id: 'shimo', weight: 3 },
        { id: 'xuekuilei', weight: 3 }, { id: 'gukudanei', weight: 3 },
      ],
      count: 20,
      boss: { id: 'heixinlaoren', x: 6, y: 27 },
      npcs: [],
      portals: [{ to: 'siling', x: 42, y: 27 }, { to: 'fenxiang', x: 2, y: 4 }],
    },
    {
      key: 'fenxiang',
      name: '焚香谷',
      sub: '谷中三日不熄火',
      lv: [35, 43],
      biome: 'fire',
      w: 46, h: 34,
      start: { x: 42, y: 28 },
      blocks: [
        { x: 10, y: 6, w: 8, h: 5 }, { x: 26, y: 4, w: 7, h: 6 }, { x: 36, y: 14, w: 6, h: 5 },
        { x: 6, y: 18, w: 7, h: 6 }, { x: 20, y: 20, w: 9, h: 6 }, { x: 30, y: 26, w: 7, h: 4 },
      ],
      decor: { lava: 26, ember: 40, rock: 14 },
      spawns: [
        { id: 'huoqilin', weight: 3 }, { id: 'yanmo', weight: 4 },
        { id: 'zhuque', weight: 2 }, { id: 'xuanhuowei', weight: 1 },
      ],
      count: 20,
      boss: { id: 'yunyilan', x: 8, y: 6 },
      npcs: [],
      portals: [{ to: 'wanfu', x: 44, y: 28 }, { to: 'huqi', x: 2, y: 30 }],
    },
    {
      key: 'huqi',
      name: '狐岐山',
      sub: '玄火鉴埋在这里，守着它的是一只狐狸',
      lv: [41, 48],
      biome: 'forest',
      w: 46, h: 34,
      start: { x: 42, y: 6 },
      blocks: [
        { x: 8, y: 8, w: 7, h: 5 }, { x: 22, y: 6, w: 6, h: 6 }, { x: 34, y: 16, w: 6, h: 5 },
        { x: 10, y: 20, w: 8, h: 6 }, { x: 24, y: 22, w: 8, h: 6 },
      ],
      decor: { tree: 44, grass: 60, rock: 12 },
      spawns: [
        { id: 'huyao', weight: 4 }, { id: 'jiuweiyou', weight: 2 },
        { id: 'shanling', weight: 3 }, { id: 'huqishou', weight: 1 },
      ],
      count: 20,
      boss: { id: 'xiaobai', x: 8, y: 28 },
      npcs: [],
      portals: [{ to: 'fenxiang', x: 44, y: 6 }, { to: 'nanjiang', x: 2, y: 4 }],
    },
    {
      key: 'nanjiang',
      name: '南疆蛮荒',
      sub: '瘴气里养着这世上最毒的东西',
      lv: [46, 53],
      biome: 'swamp',
      w: 46, h: 34,
      start: { x: 42, y: 26 },
      blocks: [
        { x: 8, y: 5, w: 8, h: 6 }, { x: 24, y: 8, w: 7, h: 5 }, { x: 34, y: 4, w: 7, h: 5 },
        { x: 6, y: 20, w: 9, h: 6 }, { x: 22, y: 22, w: 8, h: 6 },
      ],
      decor: { swamp: 30, vine: 34, bone: 12 },
      spawns: [
        { id: 'guchong', weight: 4 }, { id: 'qiweiwugong_m', weight: 3 },
        { id: 'wuji', weight: 2 }, { id: 'manhuangshou', weight: 1 },
      ],
      count: 22,
      boss: { id: 'shoushenshizhe', x: 8, y: 6 },
      npcs: [],
      portals: [{ to: 'huqi', x: 44, y: 26 }, { to: 'guiwangzong', x: 2, y: 30 }],
    },
    {
      key: 'guiwangzong',
      name: '鬼王宗',
      sub: '魔教第一大宗，黑石为殿',
      lv: [52, 58],
      biome: 'dark',
      w: 46, h: 34,
      start: { x: 42, y: 28 },
      blocks: [
        { x: 10, y: 4, w: 10, h: 6 }, { x: 26, y: 6, w: 8, h: 6 }, { x: 36, y: 16, w: 6, h: 6 },
        { x: 6, y: 16, w: 8, h: 6 }, { x: 20, y: 20, w: 10, h: 7 },
      ],
      decor: { pillar: 22, torch: 26, fog: 14 },
      spawns: [
        { id: 'guizu', weight: 4 }, { id: 'youjiwei', weight: 3 },
        { id: 'mojiaozhanglao', weight: 2 }, { id: 'xuelian', weight: 1 },
      ],
      count: 22,
      boss: { id: 'guiwang', x: 8, y: 6 },
      npcs: ['jinpinger'],
      portals: [{ to: 'nanjiang', x: 44, y: 28 }, { to: 'tongtian', x: 2, y: 4 }],
    },
    {
      key: 'tongtian',
      name: '通天峰',
      sub: '诛仙剑阵在此，问道于天',
      lv: [57, 65],
      biome: 'sky',
      w: 46, h: 34,
      start: { x: 42, y: 28 },
      blocks: [
        { x: 12, y: 6, w: 8, h: 6 }, { x: 28, y: 8, w: 8, h: 6 },
        { x: 8, y: 20, w: 8, h: 6 }, { x: 26, y: 22, w: 8, h: 6 }, { x: 20, y: 14, w: 6, h: 5 },
      ],
      decor: { cloud: 30, pillar: 18, sword: 20 },
      spawns: [
        { id: 'qingyunjianshi', weight: 4 }, { id: 'hufazhanglao', weight: 2 },
        { id: 'zhuxianjianling', weight: 1 }, { id: 'jianzhen', weight: 3 },
      ],
      count: 22,
      boss: { id: 'daoxuan', x: 8, y: 6 },
      npcs: ['luxueqi'],
      portals: [{ to: 'guiwangzong', x: 44, y: 28 }],
    },
  ];

  var byKey = {};
  for (var i = 0; i < MAPS.length; i++) {
    var m = MAPS[i];
    m.index = i;
    m.bossRespawnMs = 60000;
    byKey[m.key] = m;
  }

  ZX.MAPS = {
    all: MAPS,
    byKey: function (k) {
      return byKey[k] || MAPS[0];
    },
    /** 传送面板里的顺序 = 剧情顺序 */
    order: MAPS.map(function (m) {
      return m.key;
    }),
  };
})(window);
