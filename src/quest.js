/**
 * 任务运行时。只维护"当前这一条"，链式推进。
 *
 * 进度记在 player.quest.progress 上（一个数字就够，因为每条任务只有一个目标）。
 * 交任务要回到指定 NPC 面前，这是 MMO 的跑腿味，也顺便把玩家往剧情地点带。
 */
(function (global) {
  'use strict';

  var ZX = global.ZX;

  /** 当前任务定义；全做完了返回 null */
  function current(p) {
    if (!p.quest.current) return null;
    return ZX.QUESTS.byKey(p.quest.current);
  }

  /** 等级不够时任务是"已接但做不了"，面板上要提示 */
  function locked(p) {
    var q = current(p);
    return !!q && p.level < q.lv;
  }

  function complete(p) {
    var q = current(p);
    if (!q) return false;
    if (p.level < q.lv) return false;
    var g = q.goal;
    if (g.type === 'kill') return p.quest.progress >= g.count;
    if (g.type === 'boss') return p.quest.progress > 0;
    if (g.type === 'level') return p.level >= g.count;
    if (g.type === 'talk') return p.quest.progress > 0;
    return false;
  }

  /** 杀怪时调用，推进击杀类目标 */
  function onKill(p, monsterDef) {
    var q = current(p);
    if (!q || p.level < q.lv) return false;
    var g = q.goal;
    if (g.type === 'kill' && g.monster === monsterDef.id && p.quest.progress < g.count) {
      p.quest.progress += 1;
      return true;
    }
    if (g.type === 'boss' && g.id === monsterDef.id && p.quest.progress === 0) {
      p.quest.progress = 1;
      return true;
    }
    return false;
  }

  /** 和 NPC 说话时调用 */
  function onTalk(p, npcKey) {
    var q = current(p);
    if (!q) return false;
    if (q.goal.type === 'talk' && q.goal.npc === npcKey && p.quest.progress === 0) {
      p.quest.progress = 1;
      return true;
    }
    return false;
  }

  /** 这个 NPC 身上有没有可交的任务 */
  function canTurnInAt(p, npcKey) {
    var q = current(p);
    return !!q && q.turnIn === npcKey && complete(p);
  }

  /**
   * 交任务：发奖励、推进到下一条。
   * 返回 { quest, exp, gold, items, levels, overflow }。
   * overflow 是背包装不下、掉在地上的物品，交给调用方处理。
   */
  function turnIn(p, npcKey) {
    if (!canTurnInAt(p, npcKey)) return null;
    var q = current(p);
    var r = q.reward || {};
    var overflow = [];

    p.gold += r.gold || 0;
    var levels = ZX.Player.gainExp(p, r.exp || 0);

    if (r.items) {
      for (var i = 0; i < r.items.length; i++) {
        var res = ZX.Inventory.add(p.bag, r.items[i], 1);
        p.bag = res.bag;
        if (res.added < 1) overflow.push(r.items[i]);
      }
    }

    p.quest.done[q.key] = true;
    var next = ZX.QUESTS.next(q.key);
    p.quest.current = next ? next.key : null;
    p.quest.progress = 0;

    return {
      quest: q,
      exp: r.exp || 0,
      gold: r.gold || 0,
      items: r.items || [],
      levels: levels,
      overflow: overflow,
      next: next,
    };
  }

  /** 这个 NPC 是不是当前任务的发布人（对话框里要显示任务简介） */
  function isGiver(p, npcKey) {
    var q = current(p);
    return !!q && q.giver === npcKey && !complete(p);
  }

  /**
   * 当前任务要打的怪 id。没有击杀类目标、等级不够、或已经打够了都返回 null。
   *
   * 渲染层拿它在场上把目标怪标出来——不然玩家面对一地长得都差不多的妖兽，
   * 根本不知道该打哪只，只能挨个试。
   */
  function targetMonsterId(p) {
    var q = current(p);
    if (!q || p.level < q.lv || complete(p)) return null;
    if (q.goal.type === 'kill') return q.goal.monster;
    if (q.goal.type === 'boss') return q.goal.id;
    return null;
  }

  ZX.Quest = {
    current: current,
    locked: locked,
    complete: complete,
    onKill: onKill,
    onTalk: onTalk,
    canTurnInAt: canTurnInAt,
    turnIn: turnIn,
    isGiver: isGiver,
    targetMonsterId: targetMonsterId,
  };
})(window);
