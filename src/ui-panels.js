/**
 * 各个面板的内容与交互：背包 / 角色 / 技能 / 任务 / 传送 / 商店 / NPC 对话。
 *
 * 统一用事件委托：面板重画后不用重新绑事件，点到带 data-act 的元素就分发。
 * 每次操作完重画整块面板——数据量很小，这样比精细更新可靠得多。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;
  var U = ZX.U;
  var esc = ZX.esc;

  function Panels(game, ui) {
    var self = this;
    this.game = game;
    this.ui = ui;
    this.shopNpc = null;
    this.selected = -1;

    ui.el.panelBody.addEventListener('click', function (e) {
      var node = e.target;
      while (node && node !== ui.el.panelBody && !node.getAttribute('data-act')) node = node.parentNode;
      if (!node || node === ui.el.panelBody) return;
      e.preventDefault();
      self.dispatch(node.getAttribute('data-act'), node.getAttribute('data-arg'));
    });

    ui.el.dialog.addEventListener('click', function (e) {
      var node = e.target;
      while (node && node !== ui.el.dialog && !node.getAttribute('data-act')) node = node.parentNode;
      if (!node || node === ui.el.dialog) return;
      e.preventDefault();
      self.dispatch(node.getAttribute('data-act'), node.getAttribute('data-arg'));
    });

    ui.el.itempop.addEventListener('click', function (e) {
      // 点弹窗外的遮罩就关掉
      if (e.target === ui.el.itempop) {
        self.closeItem();
        return;
      }
      var node = e.target;
      while (node && node !== ui.el.itempop && !node.getAttribute('data-act')) node = node.parentNode;
      if (!node || node === ui.el.itempop) return;
      e.preventDefault();
      self.dispatch(node.getAttribute('data-act'), node.getAttribute('data-arg'));
    });
  }

  Panels.prototype.dispatch = function (act, arg) {
    var g = this.game;
    var p = g.player;

    switch (act) {
      case 'select':
        this.selected = Number(arg);
        this.showItem(this.selected);
        break;

      case 'close-item':
        this.closeItem();
        break;

      case 'equip': {
        var res = ZX.Inventory.equip(p.bag, p.equip, Number(arg), p.sect, p.level);
        if (!res) {
          g.hooks.log('穿不上——修为或门派不合。', 'warn');
          g.audio.play('error');
        } else {
          p.bag = res.bag;
          p.equip = res.equip;
          ZX.Player.recompute(p);
          g.hooks.log('装备了【' + res.item.name + '】', 'loot');
          g.audio.play('loot');
        }
        this.closeItem();
        this.bag();
        break;
      }

      case 'unequip': {
        var un = ZX.Inventory.unequip(p.bag, p.equip, arg);
        if (!un) {
          g.hooks.log('背包满了，脱不下来。', 'warn');
          g.audio.play('error');
        } else {
          p.bag = un.bag;
          p.equip = un.equip;
          ZX.Player.recompute(p);
        }
        this.char();
        break;
      }

      case 'use': {
        var idx = Number(arg);
        var r = ZX.Player.usePotion(p, idx);
        if (r && r.ok) {
          g.hooks.log('服下【' + r.item.name + '】' +
            (r.healed ? '，气血 +' + r.healed : '') +
            (r.restored ? '，灵力 +' + r.restored : ''), 'loot');
          g.audio.play('heal');
        } else if (r && r.msg) {
          g.hooks.log(r.msg, 'warn');
          g.audio.play('error');
        }
        // 这一格还有剩就把弹窗留着，方便连着吃；吃完了才关
        if (p.bag[idx]) this.showItem(idx);
        else this.closeItem();
        this.bag();
        break;
      }

      case 'drop':
        p.bag = ZX.Inventory.removeAt(p.bag, Number(arg), 9999);
        this.selected = -1;
        this.closeItem();
        this.bag();
        break;

      case 'point':
        if (ZX.Player.spendPoint(p, arg)) g.audio.play('loot');
        this.char();
        break;

      case 'travel':
        this.travelTo(arg);
        break;

      case 'buy':
        this.buy(arg);
        break;

      case 'sell':
        this.sell(Number(arg));
        break;

      case 'tab-buy':
        this.shop(this.shopNpc, 'buy');
        break;

      case 'tab-sell':
        this.shop(this.shopNpc, 'sell');
        break;

      case 'shop':
        this.ui.el.dialog.classList.add('hidden');
        this.shop(ZX.NPCS.byKey(arg), 'buy');
        break;

      case 'accept':
        this.ui.el.dialog.classList.add('hidden');
        break;

      case 'turnin':
        this.turnIn(arg);
        break;

      case 'rest':
        p.hp = p.stats.hp;
        p.mp = p.stats.mp;
        g.hooks.log('歇了一晚，气血灵力尽复。', 'sys');
        g.audio.play('heal');
        this.ui.el.dialog.classList.add('hidden');
        break;

      case 'close':
        this.ui.closePanel();
        break;

      default:
        break;
    }
  };

  // ── 背包 ────────────────────────────────────────────────
  Panels.prototype.bag = function () {
    var p = this.game.player;
    var html = '<div class="bag-grid">';

    for (var i = 0; i < p.bag.length; i++) {
      var stack = p.bag[i];
      var cls = 'cell' + (this.selected === i ? ' sel' : '');
      if (!stack) {
        html += '<div class="' + cls + ' empty" data-act="select" data-arg="' + i + '"></div>';
        continue;
      }
      var item = ZX.ITEMS.byId(stack.id);
      if (!item) {
        html += '<div class="' + cls + ' empty"></div>';
        continue;
      }
      var q = ZX.QUALITY[item.q];
      html += '<div class="' + cls + '" data-act="select" data-arg="' + i + '" ' +
        'style="--q:' + q.color + '" title="' + esc(item.name) + '">' +
        '<span class="cell-name">' + esc(item.name) + '</span>' +
        (stack.n > 1 ? '<span class="cell-n">' + stack.n + '</span>' : '') +
        '</div>';
    }
    html += '</div>';

    html += '<div class="bag-foot">灵石 <b>' + U.big(p.gold) + '</b>　空格 ' +
      p.bag.filter(function (s) { return !s; }).length + '/' + p.bag.length + '</div>';

    this.ui.show('bag', '背包', html);
  };

  /**
   * 物品详情弹窗。
   *
   * 以前是把详情接在格子网格后面，40 个格子铺下来，手机上详情直接跑到屏幕外，
   * 点了没反应——所以改成压在面板之上的弹窗。
   */
  Panels.prototype.showItem = function (index) {
    var p = this.game.player;
    var stack = p.bag[index];
    if (index < 0 || !stack) {
      this.closeItem();
      return;
    }
    var item = ZX.ITEMS.byId(stack.id);
    if (!item) {
      this.closeItem();
      return;
    }

    var html = '<div class="ip-box">' + itemCard(item, p);
    if (stack.n > 1) html += '<div class="ic-price">持有 ' + stack.n + ' 个</div>';

    html += '<div class="ip-btns">';
    if (ZX.ITEMS.isGear(item)) {
      var ok = ZX.ITEMS.canEquip(item, p.sect, p.level);
      html += '<button class="btn primary" data-act="equip" data-arg="' + index + '"' +
        (ok ? '' : ' disabled') + '>装备</button>';
    }
    if (item.type === 'potion') {
      html += '<button class="btn primary" data-act="use" data-arg="' + index + '">服用</button>';
    }
    html += '<button class="btn danger" data-act="drop" data-arg="' + index + '">丢弃</button>';
    html += '<button class="btn" data-act="close-item">关闭</button>';
    html += '</div></div>';

    this.ui.el.itempop.innerHTML = html;
    this.ui.el.itempop.classList.remove('hidden');
  };

  Panels.prototype.closeItem = function () {
    this.selected = -1;
    this.ui.el.itempop.classList.add('hidden');
  };

  /** 物品卡片。装备会和身上那件对比，直接标出属性差 */
  function itemCard(item, p, hideCompare) {
    var q = ZX.QUALITY[item.q];
    var html = '<div class="item-card" style="--q:' + q.color + '">';
    html += '<div class="ic-head"><span class="ic-name">' + esc(item.name) + '</span>' +
      '<span class="ic-q">' + esc(q.name) + '</span></div>';
    html += '<div class="ic-meta">' + esc(slotName(item)) +
      (item.lv > 1 ? '　需 ' + item.lv + ' 级' : '') +
      (item.sect ? '　<b>' + esc(ZX.sect(item.sect).name) + '专用</b>' : '') + '</div>';

    var worn = ZX.ITEMS.isGear(item) && !hideCompare ? ZX.ITEMS.byId(p.equip[item.slot]) : null;

    if (item.stats) {
      html += '<div class="ic-stats">';
      for (var k in item.stats) {
        if (!Object.prototype.hasOwnProperty.call(item.stats, k)) continue;
        var name = ZX.Stats.DERIVED_NAMES[k];
        if (!name) continue;
        var v = item.stats[k];
        var line = '<span>' + esc(name) + ' +' + ZX.Stats.fmt(k, v) + '</span>';
        if (worn && worn.id !== item.id) {
          var old = (worn.stats && worn.stats[k]) || 0;
          var d = v - old;
          if (Math.abs(d) > 0.0001) {
            line += '<i class="' + (d > 0 ? 'up' : 'down') + '">' +
              (d > 0 ? '+' : '−') + ZX.Stats.fmt(k, Math.abs(d)) + '</i>';
          }
        }
        html += '<div class="ic-stat">' + line + '</div>';
      }
      // 身上有、这件没有的属性也要标出来，否则换装会亏得不明不白
      if (worn && worn.id !== item.id && worn.stats) {
        for (var wk in worn.stats) {
          if (!Object.prototype.hasOwnProperty.call(worn.stats, wk)) continue;
          if (item.stats[wk] != null) continue;
          var wn = ZX.Stats.DERIVED_NAMES[wk];
          if (!wn) continue;
          html += '<div class="ic-stat"><span>' + esc(wn) + ' 0</span>' +
            '<i class="down">−' + ZX.Stats.fmt(wk, worn.stats[wk]) + '</i></div>';
        }
      }
      html += '</div>';
    }

    if (item.active) {
      html += '<div class="ic-active">主动 · ' + esc(item.active.name) +
        '　冷却 ' + (item.active.cd / 1000) + 's</div>';
    }
    if (item.use) {
      var u = item.use;
      var parts = [];
      if (u.hp || u.hpPct) parts.push('回气血 ' + (u.hp ? u.hp : '') + (u.hpPct ? ' +' + (u.hpPct * 100) + '%' : ''));
      if (u.mp || u.mpPct) parts.push('回灵力 ' + (u.mp ? u.mp : '') + (u.mpPct ? ' +' + (u.mpPct * 100) + '%' : ''));
      html += '<div class="ic-active">' + esc(parts.join('　')) + '</div>';
    }

    html += '<div class="ic-desc">' + esc(item.desc) + '</div>';
    html += '<div class="ic-price">售价 ' + U.big(ZX.ITEMS.sellPrice(item)) + ' 灵石</div>';
    html += '</div>';
    return html;
  }

  function slotName(item) {
    for (var i = 0; i < ZX.SLOTS.length; i++) {
      if (ZX.SLOTS[i].key === item.slot) return ZX.SLOTS[i].name;
    }
    return item.type === 'potion' ? '丹药' : '材料';
  }

  // ── 角色 ────────────────────────────────────────────────
  Panels.prototype.char = function () {
    var p = this.game.player;
    var sect = ZX.sect(p.sect);
    var s = p.stats;
    var i, k;

    var html = '<div class="char-top">' +
      '<div class="ct-name">' + esc(p.name) + '</div>' +
      '<div class="ct-sect" style="color:' + sect.color + '">' +
      esc(sect.name) + ' · ' + esc(sect.art) + '　Lv.' + p.level + '</div>' +
      '<div class="ct-quote">「' + esc(sect.quote) + '」</div></div>';

    // 装备栏
    html += '<div class="eq-grid">';
    for (i = 0; i < ZX.SLOTS.length; i++) {
      var slot = ZX.SLOTS[i];
      var item = ZX.ITEMS.byId(p.equip[slot.key]);
      if (item) {
        html += '<div class="eq-cell" style="--q:' + ZX.QUALITY[item.q].color + '" ' +
          'data-act="unequip" data-arg="' + slot.key + '" title="点击脱下">' +
          '<span class="eq-slot">' + esc(slot.name) + '</span>' +
          '<span class="eq-item">' + esc(item.name) + '</span></div>';
      } else {
        html += '<div class="eq-cell empty"><span class="eq-slot">' + esc(slot.name) + '</span>' +
          '<span class="eq-item">空</span></div>';
      }
    }
    html += '</div>';

    // 加点
    html += '<div class="sec-title">根骨　<b>剩余 ' + p.points + ' 点</b></div><div class="base-grid">';
    for (i = 0; i < ZX.Stats.BASE_KEYS.length; i++) {
      k = ZX.Stats.BASE_KEYS[i];
      html += '<div class="base-row"><span>' + esc(ZX.Stats.BASE_NAMES[k]) + '</span>' +
        '<b>' + p.base[k] + '</b>' +
        '<button class="btn tiny" data-act="point" data-arg="' + k + '"' +
        (p.points > 0 ? '' : ' disabled') + '>+</button></div>';
    }
    html += '</div>';
    html += '<div class="hint">体质＝气血与防御　灵根＝灵力与法力　身法＝攻击、暴击、闪避　悟性＝经验加成</div>';

    // 衍生属性
    html += '<div class="sec-title">属性</div><div class="stat-grid">';
    var order = ['hp', 'mp', 'atk', 'mag', 'def', 'mdef', 'crit', 'dodge', 'speed', 'lifesteal', 'expBonus'];
    for (i = 0; i < order.length; i++) {
      k = order[i];
      if (s[k] === 0 && (k === 'lifesteal' || k === 'expBonus' || k === 'speed')) continue;
      html += '<div class="stat-row"><span>' + esc(ZX.Stats.DERIVED_NAMES[k]) + '</span><b>' +
        ZX.Stats.fmt(k, s[k]) + '</b></div>';
    }
    html += '</div>';

    html += '<div class="sec-title">行迹</div><div class="stat-grid">' +
      '<div class="stat-row"><span>斩妖</span><b>' + U.big(p.kills) + '</b></div>' +
      '<div class="stat-row"><span>殒落</span><b>' + p.deaths + '</b></div>' +
      '<div class="stat-row"><span>灵石</span><b>' + U.big(p.gold) + '</b></div>' +
      '<div class="stat-row"><span>历时</span><b>' + U.mmss(p.playMs) + '</b></div>' +
      '</div>';

    this.ui.show('char', '角色', html);
  };

  // ── 技能 ────────────────────────────────────────────────
  Panels.prototype.skills = function () {
    var p = this.game.player;
    var sect = ZX.sect(p.sect);
    var html = '<div class="hint">' + esc(sect.name) + ' · ' + esc(sect.art) +
      '　技能随修为自动参悟，无需点数。</div><div class="skill-list">';

    for (var i = 0; i < sect.skills.length; i++) {
      var s = sect.skills[i];
      var locked = p.level < s.lv;
      html += '<div class="skill-row' + (locked ? ' locked' : '') + '" style="--c:' + sect.color + '">' +
        '<div class="sk-head"><span class="sk-name">' + esc(s.name) + '</span>' +
        '<span class="sk-lv">' + (locked ? '需 ' + s.lv + ' 级' : '快捷键 ' + (i + 1)) + '</span></div>' +
        '<div class="sk-meta">灵力 ' + s.mp + '　冷却 ' + (s.cd / 1000) + 's' +
        (s.power ? '　威力 ×' + s.power : '') + '</div>' +
        '<div class="sk-desc">' + esc(s.desc) + '</div></div>';
    }
    html += '</div>';

    var tal = ZX.Inventory.talisman(p.equip);
    if (tal && tal.active) {
      html += '<div class="sec-title">法宝</div><div class="skill-list">' +
        '<div class="skill-row" style="--c:' + ZX.QUALITY[tal.q].color + '">' +
        '<div class="sk-head"><span class="sk-name">' + esc(tal.name) + ' · ' + esc(tal.active.name) + '</span>' +
        '<span class="sk-lv">快捷键 Q</span></div>' +
        '<div class="sk-meta">冷却 ' + (tal.active.cd / 1000) + 's</div>' +
        '<div class="sk-desc">' + esc(tal.desc) + '</div></div></div>';
    }

    this.ui.show('skills', '技能', html);
  };

  // ── 任务 ────────────────────────────────────────────────
  Panels.prototype.quest = function () {
    var p = this.game.player;
    var q = ZX.Quest.current(p);
    var html = '';

    if (q) {
      var giver = ZX.NPCS.byKey(q.giver);
      var turn = ZX.NPCS.byKey(q.turnIn);
      var done = ZX.Quest.complete(p);
      html += '<div class="quest-card' + (done ? ' done' : '') + '">' +
        '<div class="q-name">' + esc(q.name) + '</div>' +
        '<div class="q-brief">' + esc(q.brief) + '</div>' +
        '<div class="q-goal">' + esc(ZX.QUESTS.goalText(q, p.quest.progress)) + '</div>' +
        '<div class="q-npc">发布：' + esc(giver ? giver.name : '—') +
        '（' + esc(giver ? ZX.MAPS.byKey(giver.map).name : '') + '）　' +
        '交付：' + esc(turn ? turn.name : '—') +
        '（' + esc(turn ? ZX.MAPS.byKey(turn.map).name : '') + '）</div>';
      if (p.level < q.lv) html += '<div class="q-lock">修为不足，需 ' + q.lv + ' 级</div>';
      html += '<div class="q-reward">酬劳：' + U.big(q.reward.exp) + ' 经验　' +
        U.big(q.reward.gold) + ' 灵石' + rewardItems(q) + '</div></div>';
    } else {
      html += '<div class="quest-card done"><div class="q-name">江湖路远</div>' +
        '<div class="q-brief">主线已尽。剑还在手里，人已经走远了。</div></div>';
    }

    var doneKeys = Object.keys(p.quest.done);
    if (doneKeys.length) {
      html += '<div class="sec-title">已了的因果（' + doneKeys.length + '）</div><div class="q-done-list">';
      for (var i = 0; i < ZX.QUESTS.chain.length; i++) {
        var d = ZX.QUESTS.chain[i];
        if (!p.quest.done[d.key]) continue;
        html += '<div class="q-done-row"><span>' + esc(d.name) + '</span>' +
          '<i>' + esc(d.done) + '</i></div>';
      }
      html += '</div>';
    }

    this.ui.show('quest', '任务', html);
  };

  function rewardItems(q) {
    if (!q.reward.items || !q.reward.items.length) return '';
    var names = [];
    for (var i = 0; i < q.reward.items.length; i++) {
      var it = ZX.ITEMS.byId(q.reward.items[i]);
      if (it) names.push(it.name);
    }
    return names.length ? '　' + esc(names.join('、')) : '';
  }

  // ── 传送 ────────────────────────────────────────────────
  Panels.prototype.map = function () {
    var p = this.game.player;
    var html = '<div class="hint">脱离战斗后可御剑往返去过的地方。未去过的须从相邻地图走过去。</div>' +
      '<div class="map-list">';

    for (var i = 0; i < ZX.MAPS.all.length; i++) {
      var m = ZX.MAPS.all[i];
      var visited = !!p.visited[m.key];
      var here = p.map === m.key;
      var cls = 'map-row' + (here ? ' here' : '') + (visited ? '' : ' locked');
      html += '<div class="' + cls + '"' +
        (visited && !here ? ' data-act="travel" data-arg="' + m.key + '"' : '') + '>' +
        '<div class="m-name">' + esc(visited ? m.name : '？？？') +
        (here ? '　<i>所在</i>' : '') + (m.safe ? '　<i class="safe">安全</i>' : '') + '</div>' +
        '<div class="m-sub">' + esc(visited ? m.sub : '尚未踏足') +
        '　Lv.' + m.lv[0] + '-' + m.lv[1] + '</div></div>';
    }
    html += '</div>';
    this.ui.show('map', '山河图', html);
  };

  Panels.prototype.travelTo = function (key) {
    var g = this.game;
    if (g.inCombat > 0) {
      g.hooks.log('战斗中无法御剑。', 'warn');
      g.audio.play('error');
      return;
    }
    if (!g.player.visited[key]) return;
    this.ui.closePanel();
    g.changeMap(key);
  };

  // ── 商店 ────────────────────────────────────────────────
  Panels.prototype.shop = function (npc, tab) {
    if (!npc) return;
    this.shopNpc = npc;
    var p = this.game.player;
    var html = '<div class="shop-tabs">' +
      '<button class="btn' + (tab === 'buy' ? ' primary' : '') + '" data-act="tab-buy">买</button>' +
      '<button class="btn' + (tab === 'sell' ? ' primary' : '') + '" data-act="tab-sell">卖</button>' +
      '<span class="shop-gold">灵石 ' + U.big(p.gold) + '</span></div>';

    var i;
    if (tab === 'sell') {
      html += '<div class="shop-list">';
      var any = false;
      for (i = 0; i < p.bag.length; i++) {
        if (!p.bag[i]) continue;
        var si = ZX.ITEMS.byId(p.bag[i].id);
        if (!si) continue;
        any = true;
        html += '<div class="shop-row" style="--q:' + ZX.QUALITY[si.q].color + '">' +
          '<span class="s-name">' + esc(si.name) + (p.bag[i].n > 1 ? ' ×' + p.bag[i].n : '') + '</span>' +
          '<span class="s-price">' + U.big(ZX.ITEMS.sellPrice(si)) + '</span>' +
          '<button class="btn tiny" data-act="sell" data-arg="' + i + '">卖一个</button></div>';
      }
      if (!any) html += '<div class="hint">背包空空如也。</div>';
      html += '</div>';
    } else {
      html += '<div class="shop-list">';
      for (i = 0; i < npc.stock.length; i++) {
        var item = ZX.ITEMS.byId(npc.stock[i]);
        if (!item) continue;
        var afford = p.gold >= item.price;
        html += '<div class="shop-row" style="--q:' + ZX.QUALITY[item.q].color + '">' +
          '<span class="s-name">' + esc(item.name) + '</span>' +
          '<span class="s-lv">' + (item.lv > 1 ? 'Lv' + item.lv : '') + '</span>' +
          '<span class="s-price">' + U.big(item.price) + '</span>' +
          '<button class="btn tiny' + (afford ? ' primary' : '') + '" data-act="buy" data-arg="' +
          item.id + '"' + (afford ? '' : ' disabled') + '>买</button></div>';
        html += '<div class="s-desc">' + esc(item.desc) + '</div>';
      }
      html += '</div>';
    }

    this.ui.show('shop', npc.name + ' · ' + npc.title, html);
  };

  Panels.prototype.buy = function (id) {
    var g = this.game;
    var p = g.player;
    var item = ZX.ITEMS.byId(id);
    if (!item) return;
    if (p.gold < item.price) {
      g.hooks.log('灵石不够。', 'warn');
      g.audio.play('error');
      return;
    }
    if (ZX.Inventory.isFull(p.bag) && !item.stackable) {
      g.hooks.log('背包满了。', 'warn');
      g.audio.play('error');
      return;
    }
    var res = ZX.Inventory.add(p.bag, id, 1);
    if (res.added < 1) {
      g.hooks.log('背包满了。', 'warn');
      g.audio.play('error');
      return;
    }
    p.bag = res.bag;
    p.gold -= item.price;
    g.hooks.log('买下【' + item.name + '】，花去 ' + item.price + ' 灵石。', 'loot');
    g.audio.play('coin');
    this.shop(this.shopNpc, 'buy');
  };

  Panels.prototype.sell = function (index) {
    var g = this.game;
    var p = g.player;
    var stack = p.bag[index];
    if (!stack) return;
    var item = ZX.ITEMS.byId(stack.id);
    if (!item) return;
    var price = ZX.ITEMS.sellPrice(item);
    p.bag = ZX.Inventory.removeAt(p.bag, index, 1);
    p.gold += price;
    g.hooks.log('卖掉【' + item.name + '】，得 ' + price + ' 灵石。', 'loot');
    g.audio.play('coin');
    this.shop(this.shopNpc, 'sell');
  };

  // ── NPC 对话 ────────────────────────────────────────────
  Panels.prototype.talk = function (npc) {
    var g = this.game;
    var p = g.player;
    var ui = this.ui;

    ZX.Quest.onTalk(p, npc.key);

    var q = ZX.Quest.current(p);
    var canTurn = ZX.Quest.canTurnInAt(p, npc.key);
    var isGiver = ZX.Quest.isGiver(p, npc.key);

    var body = '';
    var line = U.pick(npc.lines);

    if (canTurn) {
      body += '<div class="d-say">' + esc(q.done) + '</div>' +
        '<div class="d-quest"><b>' + esc(q.name) + '</b> 完成' +
        '<div class="d-reward">' + U.big(q.reward.exp) + ' 经验　' +
        U.big(q.reward.gold) + ' 灵石' + rewardItems(q) + '</div></div>';
    } else if (isGiver) {
      body += '<div class="d-say">' + esc(line) + '</div>' +
        '<div class="d-quest"><b>' + esc(q.name) + '</b>' +
        '<div class="d-brief">' + esc(q.brief) + '</div>' +
        '<div class="d-goal">' + esc(ZX.QUESTS.goalText(q, p.quest.progress)) + '</div></div>';
    } else {
      body += '<div class="d-say">' + esc(line) + '</div>';
    }

    var btns = '';
    if (canTurn) btns += '<button class="btn primary" data-act="turnin" data-arg="' + esc(npc.key) + '">复命</button>';
    if (npc.shop) btns += '<button class="btn" data-act="shop" data-arg="' + esc(npc.key) + '">买卖</button>';
    if (npc.heal) btns += '<button class="btn" data-act="rest">歇息</button>';
    btns += '<button class="btn" data-act="accept">告辞</button>';

    ui.el.dialog.innerHTML =
      '<div class="d-box">' +
      '<div class="d-head"><span class="d-name">' + esc(npc.name) + '</span>' +
      '<span class="d-title">' + esc(npc.title) + '</span></div>' +
      body +
      '<div class="d-btns">' + btns + '</div></div>';
    ui.el.dialog.classList.remove('hidden');
  };

  Panels.prototype.turnIn = function (npcKey) {
    var g = this.game;
    var p = g.player;
    var res = ZX.Quest.turnIn(p, npcKey);
    if (!res) return;

    g.hooks.log('【' + res.quest.name + '】了结。经验 +' + U.big(res.exp) +
      '，灵石 +' + U.big(res.gold), 'quest');
    g.audio.play('quest');
    g.renderer.floater(p.x, p.y - 44, '+' + U.big(res.exp) + ' 经验', 'exp');

    for (var i = 0; i < res.overflow.length; i++) {
      ZX.World.dropAt(g.world, p.x, p.y, res.overflow[i], 1);
      g.hooks.log('背包满了，奖励掉在地上。', 'warn');
    }
    if (res.levels > 0) g.onLevelUp(res.levels);

    if (res.next) {
      g.ui.toast('新的因果：' + res.next.name, 'quest');
      g.hooks.log('接下了【' + res.next.name + '】：' + res.next.brief, 'quest');
    } else {
      g.ui.toast('主线已尽', 'quest');
    }

    this.ui.el.dialog.classList.add('hidden');
  };

  ZX.Panels = Panels;
  ZX.itemCard = itemCard;
})(window);
