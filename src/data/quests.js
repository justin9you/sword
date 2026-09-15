/**
 * 主线任务链。一条线串起全书剧情，同时兼任新手引导和等级节奏器。
 *
 * 目标 goal 的四种形态：
 *   kill   杀指定怪 n 只
 *   boss   杀掉某个首领
 *   level  练到 n 级
 *   talk   找某个 NPC 说话
 *
 * 任务按数组顺序解锁：上一条交了，下一条才出现。
 * reward.items 里的物品直接进背包，背包满了就退到地上。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  var CHAIN = [
    {
      key: 'q1', name: '草庙村的黄昏', giver: 'linjingyu', turnIn: 'linjingyu',
      lv: 1,
      brief: '村外的野狗最近凶得厉害，连白天都敢下山。惊羽说，敢不敢比比谁打得多。',
      goal: { type: 'kill', monster: 'yegou', count: 6 },
      reward: { exp: 60, gold: 40, items: ['c_xiaohuan', 'c_xiaohuan', 'w_chaidao'] },
      done: '你赢了。……不过我只是让着你。',
    },
    {
      key: 'q2', name: '大梵般若', giver: 'puzhi', turnIn: 'puzhi',
      lv: 3,
      brief: '普智和尚说，他要传你一门佛门神通。代价是——先证明你还活着走得出村外。',
      goal: { type: 'kill', monster: 'shanzei', count: 5 },
      reward: { exp: 140, gold: 60, items: ['a_bu', 'p_pingan'] },
      done: '孽缘啊……罢了。这门功法，你收着。',
    },
    {
      key: 'q3', name: '血洗草庙村', giver: 'puzhi', turnIn: 'puzhi',
      lv: 5,
      brief: '那一夜之后，村子没了。你活了下来，还捡到一根黑黢黢的棍子。往北上山吧。',
      goal: { type: 'boss', id: 'toulang' },
      reward: { exp: 300, gold: 120, items: ['w_shaohuo', 'c_xiaohuan', 'c_xiaohuan'] },
      done: '往北走，上青云。别回头看。',
    },
    {
      key: 'q4', name: '七脉会武之前', giver: 'tianbuyi', turnIn: 'tianbuyi',
      lv: 6,
      brief: '田不易上下打量了你一眼："先去把峰上的野物清一清，算你入门第一课。"',
      goal: { type: 'kill', monster: 'linghou', count: 10 },
      reward: { exp: 480, gold: 160, items: ['w_qingyunjian', 'a_qingyunpao'] },
      done: '哼，还行。收拾收拾，跟我上大竹峰。',
    },
    {
      key: 'q5', name: '烧火十年', giver: 'tianlinger', turnIn: 'surou',
      lv: 9,
      brief: '灵儿说后山的竹妖把柴房拆了。师娘说先吃饭。你决定先去把柴房的账算了。',
      goal: { type: 'kill', monster: 'zhuyao', count: 12 },
      reward: { exp: 900, gold: 260, items: ['w_zhuyeqing', 's_buxue', 'c_xiaohuan'] },
      done: '回来啦？锅里温着饭，先吃。',
    },
    {
      key: 'q6', name: '千年竹妖', giver: 'songdaren', turnIn: 'songdaren',
      lv: 13,
      brief: '大师兄压低了声音："后山那东西成精了，师父不让说。你悄悄去。"',
      goal: { type: 'boss', id: 'qiannianzhuyao' },
      reward: { exp: 1800, gold: 420, items: ['t_fulongding', 'c_dahuan'] },
      done: '七弟，这事……就咱俩知道。',
    },
    {
      key: 'q7', name: '滴血洞', giver: 'tianbuyi', turnIn: 'tianbuyi',
      lv: 15,
      brief: '空桑山下的洞，据说底下有上古遗留。田不易只说了四个字：活着回来。',
      goal: { type: 'boss', id: 'xuanshe_wang' },
      reward: { exp: 4200, gold: 900, items: ['t_shixuezhu', 'b_lingwan'] },
      done: '……你身上这股气，是什么？',
    },
    {
      key: 'q8', name: '死灵渊的女子', giver: 'biyao', turnIn: 'biyao',
      lv: 22,
      brief: '一个绿衣女子拦住你，说这里的白骨兵是她"养着看门的"，被人打残了几只。',
      goal: { type: 'kill', monster: 'baigu', count: 15 },
      reward: { exp: 9000, gold: 1600, items: ['a_jiasha', 'p_lingyu'] },
      done: '呆子。下次见到我，记得躲远点。',
    },
    {
      key: 'q9', name: '四灵血阵', giver: 'biyao', turnIn: 'biyao',
      lv: 28,
      brief: '兽神要出来了。碧瑶站在阵眼上，回头看了你一眼："这次你别跟来。"',
      goal: { type: 'boss', id: 'shoushen' },
      reward: { exp: 24000, gold: 3600, items: ['t_xuanhuojian', 'a_xuepao'] },
      done: '……你怎么还是来了。',
    },
    {
      key: 'q10', name: '万蝠古窟', giver: 'zhouyixian', turnIn: 'zhouyixian',
      lv: 34,
      brief: '周一仙掐指一算："西边有个老怪物，专收活人精血。小友命里有此一劫。"',
      goal: { type: 'boss', id: 'heixinlaoren' },
      reward: { exp: 52000, gold: 6800, items: ['w_shihun', 'b_xuanwan'] },
      done: '啧，居然真让你打赢了。我这卦……算了。',
    },
    {
      key: 'q11', name: '正道与魔道', giver: 'zhouyixian', turnIn: 'zhouyixian',
      lv: 40,
      brief: '焚香谷主云易岚闭关不出。谷里的火，烧了三个月没停。',
      goal: { type: 'boss', id: 'yunyilan' },
      reward: { exp: 110000, gold: 12000, items: ['a_huoyunpao', 't_tianya'] },
      done: '正邪不两立？这四个字，是给活人听的。',
    },
    {
      key: 'q12', name: '狐岐山的守', giver: 'zhouyixian', turnIn: 'zhouyixian',
      lv: 45,
      brief: '玄火鉴里睡着一个人。守着它的九尾天狐说，除非你打赢它。',
      goal: { type: 'boss', id: 'xiaobai' },
      reward: { exp: 210000, gold: 20000, items: ['s_youxue', 'p_wangyou'] },
      done: '你救不了她。但你可以一直找下去。',
    },
    {
      key: 'q13', name: '南疆蛮荒', giver: 'jinpinger', turnIn: 'jinpinger',
      lv: 50,
      brief: '金瓶儿摇着扇子："兽神的使者跑到南疆去了。姐姐我不方便出手，你去？"',
      goal: { type: 'boss', id: 'shoushenshizhe' },
      reward: { exp: 380000, gold: 34000, items: ['w_youji', 'b_guiwan'] },
      done: '办得漂亮。这个给你，别问哪来的。',
    },
    {
      key: 'q14', name: '鬼王', giver: 'jinpinger', turnIn: 'jinpinger',
      lv: 55,
      brief: '鬼王要用十万生魂换女儿一条命。你站在殿门口，忽然不知道该不该拦。',
      goal: { type: 'boss', id: 'guiwang' },
      reward: { exp: 620000, gold: 52000, items: ['w_guiwanggujian', 't_zhenmozhu'] },
      done: '他到最后也没说一句软话。你呢？',
    },
    {
      key: 'q15', name: '诛仙剑阵', giver: 'luxueqi', turnIn: 'luxueqi',
      lv: 60,
      brief: '通天峰顶，道玄真人被诛仙剑噬心已久。陆雪琪把天琊递给你："一起。"',
      goal: { type: 'boss', id: 'daoxuan' },
      reward: { exp: 1200000, gold: 120000, items: ['w_zhuxian', 'a_zhuxianpao', 'p_hunpo'] },
      done: '……结束了。玄火鉴里的人，还在等。我们下山吧。',
    },
  ];

  var byKey = {};
  for (var i = 0; i < CHAIN.length; i++) {
    CHAIN[i].index = i;
    byKey[CHAIN[i].key] = CHAIN[i];
  }

  /** 目标的人话描述，任务面板直接显示 */
  function goalText(q, progress) {
    var g = q.goal;
    if (g.type === 'kill') {
      var m = ZX.MONSTERS.byId(g.monster);
      return '击杀 ' + (m ? m.name : g.monster) + '  ' + Math.min(progress, g.count) + '/' + g.count;
    }
    if (g.type === 'boss') {
      var b = ZX.MONSTERS.byId(g.id);
      return '讨伐 ' + (b ? b.name : g.id) + '  ' + (progress > 0 ? '已完成' : '未完成');
    }
    if (g.type === 'level') return '修为达到 ' + g.count + ' 级';
    if (g.type === 'talk') {
      var n = ZX.NPCS.byKey(g.npc);
      return '去见 ' + (n ? n.name : g.npc);
    }
    return '';
  }

  ZX.QUESTS = {
    chain: CHAIN,
    byKey: function (k) {
      return byKey[k] || null;
    },
    goalText: goalText,
    /** 链上的下一条；没有了返回 null */
    next: function (key) {
      var q = byKey[key];
      if (!q) return CHAIN[0];
      return CHAIN[q.index + 1] || null;
    },
  };
})(window);
