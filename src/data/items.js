/**
 * 物品图鉴：兵器 / 法宝 / 衣袍 / 护腕 / 靴履 / 玉佩 / 丹药 / 材料。
 *
 * 装备的 stats 直接写死在这里（不做随机词缀），因为它们大多是书里的名物，
 * 数值要能一眼看出强弱梯度。品质只影响显示颜色和售价，不再二次缩放。
 *
 * 法宝（talisman）除了被动属性还带一个主动效果 active，由 skills.js 释放：
 *   heal 回血 | nova 范围伤 | stun 定身 | charm 魅惑（敌人停手）
 *   lifesteal 限时吸血 | reflect 反伤盾 | poison 毒雾 | shield 护体
 *
 * sect 字段限定门派；不写就是谁都能用。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  // ── 兵器 ──────────────────────────────────────────────────
  var WEAPONS = [
    { id: 'w_shaohuo', name: '烧火棍', lv: 1, q: 'common',
      stats: { atk: 5, hp: 10 },
      desc: '大竹峰厨房里烧火用的木棍，黑黢黢的。张小凡用了七年。' },
    { id: 'w_chaidao', name: '柴刀', lv: 2, q: 'common',
      stats: { atk: 8 },
      desc: '砍柴的家什，开刃还算快。' },
    { id: 'w_qingyunjian', name: '青云弟子剑', lv: 5, q: 'fine',
      stats: { atk: 14, mag: 6, crit: 0.01 },
      desc: '青云门外门弟子的制式佩剑，剑格上刻着云纹。' },
    { id: 'w_jingtie', name: '精铁长剑', lv: 9, q: 'common',
      stats: { atk: 22, def: 3 },
      desc: '河阳城铁匠铺的上等货，一分钱一分货。' },
    { id: 'w_zhuyeqing', name: '竹叶青', lv: 12, q: 'fine',
      stats: { atk: 30, agiSpeed: 0, crit: 0.02, speed: 6 },
      desc: '大竹峰后山的百年翠竹削成，轻，快，认主。' },
    { id: 'w_yujian', name: '青云御剑', lv: 15, q: 'fine', sect: 'qingyun',
      stats: { atk: 32, mag: 22, mp: 40, crit: 0.02 },
      desc: '龙首峰内门弟子出师时所授，剑脊上有一道天然的云纹。' },
    { id: 'w_chanzhang', name: '伏魔禅杖', lv: 15, q: 'fine', sect: 'tianyin',
      stats: { atk: 34, def: 10, mdef: 8, hp: 60 },
      desc: '天音寺戒律院所传，杖头九环，响一声退三步邪魔。' },
    { id: 'w_yuqing', name: '焚香玉罄', lv: 15, q: 'fine', sect: 'fenxiang',
      stats: { mag: 40, mp: 50, atk: 8 },
      desc: '焚香谷法器，敲之清越，火意自生。' },
    { id: 'w_guizhao', name: '幽冥鬼爪', lv: 15, q: 'fine', sect: 'guiwang',
      stats: { atk: 42, crit: 0.03, lifesteal: 0.03 },
      desc: '以万蝠古窟的尸魔指骨炼成，带着洗不掉的腥气。' },
    { id: 'w_xuantie', name: '玄铁重剑', lv: 20, q: 'rare',
      stats: { atk: 58, def: 14, speed: -8 },
      desc: '重剑无锋。拿得动它的人，招式便是多余。' },
    { id: 'w_shihun', name: '噬魂棒', lv: 26, q: 'epic', sect: 'guiwang',
      stats: { atk: 86, lifesteal: 0.08, crit: 0.04, hp: 80 },
      desc: '通体漆黑、毫不起眼的一根短棒，谁也没想到它是上古法宝。' },
    { id: 'w_hanbing', name: '寒冰剑', lv: 26, q: 'rare',
      stats: { atk: 72, mag: 26, mdef: 14 },
      desc: '剑身覆着一层化不开的白霜，握久了指尖发麻。' },
    { id: 'w_jianglongchu', name: '降龙杵', lv: 30, q: 'rare', sect: 'tianyin',
      stats: { atk: 78, def: 30, hp: 180, mdef: 20 },
      desc: '天音寺法相所用，一杵之下，蛟龙俯首。' },
    { id: 'w_zhuquehuan', name: '朱雀环', lv: 30, q: 'rare', sect: 'fenxiang',
      stats: { mag: 96, mp: 110, crit: 0.03 },
      desc: '焚香谷四灵法器之一，环上朱雀展翅欲飞。' },
    { id: 'w_tianya', name: '天琊神剑', lv: 36, q: 'epic', sect: 'qingyun',
      stats: { atk: 118, mag: 70, crit: 0.06, mp: 90 },
      desc: '青云门至宝，剑身如秋水。陆雪琪一剑霜寒，说的就是它。' },
    { id: 'w_youji', name: '幽姬双刃', lv: 40, q: 'epic', sect: 'guiwang',
      stats: { atk: 146, crit: 0.09, lifesteal: 0.06, speed: 10 },
      desc: '一对薄如蝉翼的弯刃，出手时只听见风，看不见刀。' },
    { id: 'w_banruo', name: '大梵般若杖', lv: 40, q: 'epic', sect: 'tianyin',
      stats: { atk: 120, mag: 90, def: 44, hp: 320, mdef: 40 },
      desc: '普泓上人所持，金光不盛而不灭。' },
    { id: 'w_liuhe', name: '离火神笛', lv: 40, q: 'epic', sect: 'fenxiang',
      stats: { mag: 178, mp: 200, crit: 0.05 },
      desc: '一曲吹尽，谷中三日不熄火。' },
    { id: 'w_guiwanggujian', name: '鬼王古剑', lv: 50, q: 'legend', sect: 'guiwang',
      stats: { atk: 228, crit: 0.1, lifesteal: 0.12, hp: 300 },
      desc: '鬼王宗镇宗之宝，剑身上盘着一条不知名的黑龙。' },
    { id: 'w_tonglinghei', name: '通灵烧火棍', lv: 52, q: 'legend',
      stats: { atk: 210, mag: 150, hp: 400, lifesteal: 0.08, crit: 0.06 },
      desc: '还是那根黑棍。只是这一次，它认得握着它的人了。' },
    { id: 'w_zhuxian', name: '诛仙古剑', lv: 60, q: 'legend', sect: 'qingyun',
      stats: { atk: 300, mag: 220, crit: 0.12, mp: 260, hp: 400 },
      desc: '青云门开山之祖青叶祖师所留，天下第一凶器。' },
  ];

  // ── 法宝 ──────────────────────────────────────────────────
  var TALISMANS = [
    { id: 't_jinling', name: '金铃', lv: 4, q: 'common',
      stats: { mp: 25, mdef: 4 },
      active: { kind: 'heal', heal: 0.2, cd: 20000, name: '清心' },
      desc: '寻常镇宅铃铛，摇一摇能定神。' },
    { id: 't_fulongding', name: '伏龙鼎', lv: 10, q: 'fine',
      stats: { hp: 90, def: 8 },
      active: { kind: 'heal', heal: 0.35, healFlat: 80, cd: 26000, name: '龙息' },
      desc: '小小一尊三足鼎，鼎中终年温着一缕药气。' },
    { id: 't_shehun', name: '摄魂', lv: 16, q: 'rare',
      stats: { mag: 30, mp: 60 },
      active: { kind: 'stun', radius: 180, ms: 2600, cd: 24000, name: '摄魂' },
      desc: '万蝠古窟黑心老人的心头好，能摄人三魂七魄。' },
    { id: 't_shixuezhu', name: '噬血珠', lv: 20, q: 'epic',
      stats: { atk: 40, hp: 150, lifesteal: 0.05 },
      active: { kind: 'lifesteal', amount: 0.45, ms: 10000, cd: 40000, name: '噬血' },
      desc: '滴血洞底那滩血水里滚出来的珠子。它会饿，也会等。' },
    { id: 't_hehuanling', name: '合欢铃', lv: 24, q: 'rare',
      stats: { mag: 55, mp: 100, dodge: 0.03 },
      active: { kind: 'charm', radius: 210, ms: 4500, cd: 30000, name: '合欢' },
      desc: '合欢派金瓶儿之物，铃声一起，刀剑都软了三分。' },
    { id: 't_xuanhuojian', name: '玄火鉴', lv: 30, q: 'epic',
      stats: { mag: 110, mp: 160, crit: 0.04 },
      active: { kind: 'nova', power: 3.6, radius: 240, burn: 0.3, burnMs: 6000, cd: 34000, name: '玄火' },
      desc: '上古神器，一面古镜。镜中另有一个世界，睡着一个人。' },
    { id: 't_qiweiwugong', name: '七尾蜈蚣', lv: 34, q: 'epic',
      stats: { atk: 80, crit: 0.05 },
      active: { kind: 'poison', power: 0.6, ms: 9000, radius: 220, cd: 30000, name: '蚀骨' },
      desc: '南疆蛊王，七条尾巴各含一种毒。养它的人自己也不敢碰。' },
    { id: 't_liuhejing', name: '六合镜', lv: 40, q: 'epic',
      stats: { def: 60, mdef: 60, hp: 400 },
      active: { kind: 'reflect', ratio: 0.6, ms: 8000, cd: 38000, name: '六合' },
      desc: '照见来路，也照回去。' },
    { id: 't_tianya', name: '天琊', lv: 44, q: 'epic',
      stats: { atk: 100, mag: 100, crit: 0.05 },
      active: { kind: 'shield', shield: 0.4, ms: 9000, cd: 32000, name: '剑气护体' },
      desc: '不用它砍人的时候，它就悬在你头顶三尺。' },
    { id: 't_zhenmozhu', name: '镇魔古珠', lv: 52, q: 'legend',
      stats: { hp: 700, def: 90, mdef: 90, mp: 200 },
      active: { kind: 'shield', shield: 0.75, ms: 10000, cd: 40000, name: '镇魔' },
      desc: '镇魔古洞封印的一角。别问里面镇的是什么。' },
    { id: 't_xuanhuo_zhen', name: '玄火鉴·真', lv: 58, q: 'legend',
      stats: { mag: 260, mp: 360, crit: 0.08, hp: 300 },
      active: { kind: 'nova', power: 7.5, radius: 320, burn: 0.6, burnMs: 9000, cd: 42000, name: '玄火焚天' },
      desc: '十年之后，镜中人始终没有醒。你只好替她烧了这片天。' },
  ];

  // ── 衣袍 / 护腕 / 靴履 / 玉佩 ────────────────────────────
  var ARMORS = [
    { id: 'a_bu', name: '粗布短衣', lv: 1, q: 'common', slot: 'robe', stats: { def: 4, hp: 20 },
      desc: '草庙村随处可见的家常衣裳。' },
    { id: 'a_qingyunpao', name: '青云道袍', lv: 6, q: 'fine', slot: 'robe', stats: { def: 12, mdef: 10, hp: 60, mp: 20 },
      desc: '青云门弟子统一的白底青纹道袍，袖口绣着云。' },
    { id: 'a_jiaxiao', name: '软甲', lv: 12, q: 'common', slot: 'robe', stats: { def: 26, hp: 120 },
      desc: '河阳城货栈常备，实用但不好看。' },
    { id: 'a_jiasha', name: '天音袈裟', lv: 20, q: 'rare', slot: 'robe', stats: { def: 48, mdef: 44, hp: 300 },
      desc: '百衲而成，每一块布都来自一位圆寂的老僧。' },
    { id: 'a_xuepao', name: '血炼战袍', lv: 30, q: 'rare', slot: 'robe', stats: { def: 70, hp: 460, atk: 30, lifesteal: 0.03 },
      desc: '鬼王宗长老所着，红得发黑。' },
    { id: 'a_huoyunpao', name: '火云锦袍', lv: 38, q: 'epic', slot: 'robe', stats: { def: 96, mdef: 90, mag: 80, mp: 160 },
      desc: '焚香谷以火蚕丝织就，冬暖夏也暖。' },
    { id: 'a_zhuxianpao', name: '诛仙法袍', lv: 52, q: 'legend', slot: 'robe', stats: { def: 180, mdef: 180, hp: 1100, mag: 120 },
      desc: '青云掌门法衣，肩上那道裂口一直没补。' },

    { id: 'b_huwan', name: '皮护腕', lv: 2, q: 'common', slot: 'bracer', stats: { atk: 3, def: 3 },
      desc: '猎户的旧物。' },
    { id: 'b_tiehu', name: '铁护腕', lv: 10, q: 'common', slot: 'bracer', stats: { atk: 12, def: 10 },
      desc: '沉，但挡得住爪子。' },
    { id: 'b_lingwan', name: '灵纹护腕', lv: 18, q: 'fine', slot: 'bracer', stats: { atk: 26, mag: 26, crit: 0.02 },
      desc: '腕上一圈符文，出招时会亮。' },
    { id: 'b_xuanwan', name: '玄铁臂缚', lv: 28, q: 'rare', slot: 'bracer', stats: { atk: 52, def: 34, hp: 200 },
      desc: '万蝠古窟深处挖出的玄铁打的。' },
    { id: 'b_guiwan', name: '鬼面腕轮', lv: 40, q: 'epic', slot: 'bracer', stats: { atk: 96, crit: 0.06, lifesteal: 0.04 },
      desc: '腕轮上的鬼脸会跟着你的心跳一张一合。' },
    { id: 'b_shenwan', name: '通天腕甲', lv: 54, q: 'legend', slot: 'bracer', stats: { atk: 170, mag: 130, crit: 0.08, hp: 400 },
      desc: '通天峰祭坛下埋了千年的东西。' },

    { id: 's_caoxie', name: '草鞋', lv: 1, q: 'common', slot: 'boots', stats: { speed: 4 },
      desc: '走山路利索。' },
    { id: 's_buxue', name: '快靴', lv: 8, q: 'fine', slot: 'boots', stats: { speed: 12, dodge: 0.02 },
      desc: '鞋底纳了三十六层，踩石头不硌脚。' },
    { id: 's_yunxue', name: '踏云靴', lv: 18, q: 'rare', slot: 'boots', stats: { speed: 20, dodge: 0.04, def: 18 },
      desc: '青云弟子御剑之前，先学会用它走完七十二盘山道。' },
    { id: 's_youxue', name: '幽影靴', lv: 32, q: 'epic', slot: 'boots', stats: { speed: 28, dodge: 0.07, crit: 0.03 },
      desc: '落地无声，连尘都不惊。' },
    { id: 's_lingxu', name: '凌虚履', lv: 50, q: 'legend', slot: 'boots', stats: { speed: 38, dodge: 0.1, hp: 500, def: 80 },
      desc: '穿上它的人，脚离地三寸。' },

    { id: 'p_pingan', name: '平安符', lv: 1, q: 'common', slot: 'pendant', stats: { hp: 30, mdef: 3 },
      desc: '母亲缝在衣领里的，洗得发白了。' },
    { id: 'p_yupei', name: '青玉佩', lv: 9, q: 'fine', slot: 'pendant', stats: { mp: 45, mag: 14, mdef: 10 },
      desc: '温润，贴着皮肤放久了会热。' },
    { id: 'p_lingyu', name: '灵犀玉', lv: 20, q: 'rare', slot: 'pendant', stats: { mp: 110, mag: 40, expBonus: 0.05 },
      desc: '戴着它读道经，一夜能顶三夜。' },
    { id: 'p_xuebi', name: '血玉璧', lv: 34, q: 'epic', slot: 'pendant', stats: { hp: 420, atk: 60, lifesteal: 0.05 },
      desc: '玉里那缕红丝，每天都长一点。' },
    { id: 'p_wangyou', name: '忘忧玉', lv: 46, q: 'epic', slot: 'pendant', stats: { hp: 560, mp: 260, mdef: 90, expBonus: 0.08 },
      desc: '据说戴上就能忘掉一个人。骗人的。' },
    { id: 'p_hunpo', name: '摄魂玉魄', lv: 56, q: 'legend', slot: 'pendant', stats: { hp: 900, mp: 400, mag: 180, crit: 0.08, expBonus: 0.12 },
      desc: '十年了，玉里的人还在睡。' },
  ];

  // ── 丹药 ──────────────────────────────────────────────────
  var POTIONS = [
    { id: 'c_xiaohuan', name: '小还丹', lv: 1, q: 'common', type: 'potion',
      use: { hp: 120, hpPct: 0.15 }, price: 30,
      desc: '青云门制式伤药，回复少量气血。' },
    { id: 'c_dahuan', name: '大还丹', lv: 20, q: 'fine', type: 'potion',
      use: { hp: 600, hpPct: 0.35 }, price: 160,
      desc: '断骨续筋，江湖上一颗难求。' },
    { id: 'c_juling', name: '聚灵丹', lv: 1, q: 'common', type: 'potion',
      use: { mp: 80, mpPct: 0.2 }, price: 34,
      desc: '回复灵力，入口微苦。' },
    { id: 'c_dajuling', name: '大聚灵丹', lv: 20, q: 'fine', type: 'potion',
      use: { mp: 320, mpPct: 0.45 }, price: 180,
      desc: '焚香谷秘制，一粒管半日。' },
    { id: 'c_jiuzhuan', name: '九转金丹', lv: 35, q: 'epic', type: 'potion',
      use: { hpPct: 1, mpPct: 1 }, price: 900,
      desc: '九转还魂，气血灵力尽复。命悬一线时才舍得吃。' },
    { id: 'c_bigu', name: '辟谷丹', lv: 10, q: 'common', type: 'potion',
      use: { hpPct: 0.08, mpPct: 0.08, regen: true }, price: 50,
      desc: '修道之人赶路的干粮。' },
  ];

  // ── 材料（只用来卖钱 / 交任务）──────────────────────────
  var MATERIALS = [
    { id: 'm_neidan', name: '妖兽内丹', lv: 1, q: 'fine', type: 'material', price: 90,
      desc: '妖物修行所聚，城里的炼丹师抢着要。' },
    { id: 'm_xuanyu', name: '玄铁矿', lv: 10, q: 'common', type: 'material', price: 45,
      desc: '沉甸甸一块，打兵器的好料。' },
    { id: 'm_xueyu', name: '血玉', lv: 22, q: 'rare', type: 'material', price: 260,
      desc: '死灵渊的地底才有，带着体温。' },
    { id: 'm_huwei', name: '狐尾', lv: 40, q: 'rare', type: 'material', price: 420,
      desc: '狐岐山的战利品。摸上去很软。' },
    { id: 'm_mojing', name: '魔晶', lv: 48, q: 'epic', type: 'material', price: 800,
      desc: '魔气凝成的晶核，拿在手里手心发凉。' },
  ];

  // ── 索引与查询 ────────────────────────────────────────────
  var ALL = [];
  var byId = {};

  function register(list, type, slot) {
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      it.type = it.type || type;
      it.slot = it.slot || slot || it.type;
      if (!it.price) it.price = Math.floor((it.lv * 14 + 20) * ZX.QUALITY[it.q].mul * 1.6);
      it.stackable = it.type === 'potion' || it.type === 'material';
      ALL.push(it);
      byId[it.id] = it;
    }
  }

  register(WEAPONS, 'weapon', 'weapon');
  register(TALISMANS, 'talisman', 'talisman');
  register(ARMORS, 'armor', null);
  register(POTIONS, 'potion', 'potion');
  register(MATERIALS, 'material', 'material');

  ZX.ITEMS = {
    all: ALL,
    byId: function (id) {
      return ZX.U.own(byId, id) || null;
    },

    /** 某槽位所有装备，按等级升序 */
    bySlot: function (slot) {
      return ALL.filter(function (it) {
        return it.slot === slot;
      });
    },

    /** 装备能不能被这个门派/等级的人穿上 */
    canEquip: function (item, sectKey, level) {
      if (!item || !ZX.ITEMS.isGear(item)) return false;
      if (item.lv > level) return false;
      if (item.sect && item.sect !== sectKey) return false;
      return true;
    },

    isGear: function (item) {
      if (!item) return false;
      for (var i = 0; i < ZX.SLOTS.length; i++) {
        if (ZX.SLOTS[i].key === item.slot) return true;
      }
      return false;
    },

    /**
     * 掉落用：在 [level-7, level+2] 这个窗口里挑一件装备。
     * 越靠近玩家等级越容易出；本门派专属的权重更高，免得刷一堆用不了的。
     */
    rollGear: function (level, sectKey, luck) {
      var pool = [];
      for (var i = 0; i < ALL.length; i++) {
        var it = ALL[i];
        if (!ZX.ITEMS.isGear(it)) continue;
        if (it.lv > level + 2 || it.lv < level - 7) continue;
        if (it.sect && it.sect !== sectKey) continue;
        // 高品质越稀有；luck 来自精英/Boss，抬高好东西的权重
        var w = { common: 10, fine: 6, rare: 3, epic: 1.2, legend: 0.35 }[it.q];
        pool.push({ item: it, weight: w * (it.sect ? 1.8 : 1) * (luck ? Math.pow(luck, it.q === 'common' ? -0.5 : 1) : 1) });
      }
      if (!pool.length) return null;
      return ZX.U.pickWeighted(pool).item;
    },

    /** 卖价 = 标价的三成 */
    sellPrice: function (item) {
      return Math.max(1, Math.floor(item.price * 0.3));
    },
  };
})(window);
