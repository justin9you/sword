/**
 * NPC。坐标单位是「格」，和 maps.js 一致。
 *
 * lines  是没有任务可交互时的闲聊，随机说一句。
 * shop   为真时对话框里多一个「买卖」页签，货单由 stock 决定（物品 id 列表）。
 * heal   为真时对话就回满气血灵力（城里的客栈作用）。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  var LIST = [
    {
      key: 'puzhi', name: '普智', title: '天音寺僧人', map: 'caomiao', x: 20, y: 20, color: '#e8c87f',
      lines: [
        '小娃娃，你骨骼清奇，是块修道的料子。',
        '我这一身大梵般若，总要有个去处。',
        '莫问来路。你只管往前走。',
      ],
    },
    {
      key: 'linjingyu', name: '林惊羽', title: '草庙村少年', map: 'caomiao', x: 24, y: 22, color: '#8fc4e8',
      lines: [
        '小凡，你又去后山了？',
        '我爹说，青云门今年要收弟子。',
        '等我上了青云，定要做龙首峰第一。',
      ],
    },
    {
      key: 'tianbuyi', name: '田不易', title: '大竹峰首座', map: 'longshou', x: 36, y: 14, color: '#c4a06a',
      lines: [
        '哼，又是个来碰运气的。',
        '大竹峰虽小，规矩不小。',
        '记住了：别惹你师娘。',
      ],
    },
    {
      key: 'tianlinger', name: '田灵儿', title: '大竹峰六弟子', map: 'dazhu', x: 36, y: 20, color: '#f0a0b8',
      lines: [
        '小凡，帮我把这堆柴劈了呗？',
        '师兄他们都在后山练剑呢。',
        '你说，我跟齐师兄……算了，不说了。',
      ],
    },
    {
      key: 'surou', name: '苏茹', title: '大竹峰师娘', map: 'dazhu', x: 33, y: 22, color: '#d8c0e8',
      heal: true,
      lines: [
        '饿了吧？锅里给你留着饭。',
        '身上的伤我看过了，歇一晚就好。',
        '你师父嘴硬心软，别往心里去。',
      ],
    },
    {
      key: 'songdaren', name: '宋大仁', title: '大竹峰大弟子', map: 'dazhu', x: 39, y: 24, color: '#a8c48f',
      shop: true,
      stock: ['c_xiaohuan', 'c_juling', 'c_bigu', 'w_jingtie', 'a_jiaxiao', 'b_tiehu', 's_buxue'],
      lines: [
        '七弟，缺什么跟大师兄说。',
        '这些都是山下捎上来的，不赚你钱。',
      ],
    },
    {
      key: 'zhouyixian', name: '周一仙', title: '算命的', map: 'heyang', x: 17, y: 20, color: '#c4b48f',
      lines: [
        '天机不可泄露——不过你给钱我就泄露。',
        '小友印堂发黑，近日必有血光之灾。（十文钱谢谢）',
        '我这一卦从没算错过，错的都是天意。',
      ],
    },
    {
      key: 'shangren', name: '万货商人', title: '河阳城货栈', map: 'heyang', x: 23, y: 19, color: '#e8c060',
      shop: true,
      stock: [
        'c_xiaohuan', 'c_dahuan', 'c_juling', 'c_dajuling', 'c_jiuzhuan',
        't_jinling', 't_fulongding', 't_shehun', 'p_yupei', 'p_lingyu', 's_yunxue',
      ],
      lines: [
        '客官，什么都有，就看你出不出得起价。',
        '丹药、法宝、护身的物件，一应俱全。',
        '东西卖给我？成，不过价压三成，规矩。',
      ],
    },
    {
      key: 'tiejiang', name: '铁匠老陈', title: '河阳城铁铺', map: 'heyang', x: 12, y: 20, color: '#b08050',
      shop: true,
      stock: ['w_jingtie', 'w_xuantie', 'w_hanbing', 'a_jiaxiao', 'a_jiasha', 'b_tiehu', 'b_lingwan', 'b_xuanwan'],
      lines: [
        '玄铁我这只剩两块，卖完就没了。',
        '刀剑无眼，握紧了。',
      ],
    },
    {
      key: 'biyao', name: '碧瑶', title: '鬼王之女', map: 'siling', x: 38, y: 16, color: '#7fe0b8',
      lines: [
        '喂，呆子，你怎么跑到这儿来了？',
        '这地方阴气重，跟紧我。',
        '……你若是死了，我可不会替你收尸的。',
        '痴情咒？没什么，随口念念罢了。',
      ],
    },
    {
      key: 'jinpinger', name: '金瓶儿', title: '合欢派', map: 'guiwangzong', x: 38, y: 24, color: '#e8a0c8',
      shop: true,
      stock: ['t_hehuanling', 't_shixuezhu', 't_qiweiwugong', 'c_dahuan', 'c_jiuzhuan', 'p_xuebi'],
      lines: [
        '哟，是你呀。要点什么？姐姐这儿好东西多着呢。',
        '鬼王宗的门，进来容易出去难。',
        '碧瑶妹妹的事……你别问我。',
      ],
    },
    {
      key: 'luxueqi', name: '陆雪琪', title: '小竹峰弟子', map: 'tongtian', x: 38, y: 26, color: '#c8e8f0',
      heal: true,
      lines: [
        '……是你。',
        '天琊在我手里，从未觉得这样沉过。',
        '你要上通天峰？那便一起。',
        '我等了很久了。',
      ],
    },
  ];

  var byKey = {};
  for (var i = 0; i < LIST.length; i++) byKey[LIST[i].key] = LIST[i];

  ZX.NPCS = {
    all: LIST,
    byKey: function (k) {
      return ZX.U.own(byKey, k) || null;
    },
    /** 某张图上的 NPC，按 maps.js 里列的顺序 */
    onMap: function (mapKey) {
      var map = ZX.MAPS.byKey(mapKey);
      var out = [];
      for (var i = 0; i < map.npcs.length; i++) {
        var n = ZX.U.own(byKey, map.npcs[i]);
        if (n) out.push(n);
      }
      return out;
    },
  };
})(window);
