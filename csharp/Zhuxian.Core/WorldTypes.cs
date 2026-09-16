using System;
using System.Collections.Generic;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>场上的一只怪</summary>
    [Serializable]
    public class MonsterInstance
    {
        public int uid;
        public ZxMonster def;

        public double x;
        public double y;
        /// <summary>出生点。离家太远就回来，回来路上不理人</summary>
        public double homeX;
        public double homeY;

        public double hp;
        public double maxHp;

        /// <summary>idle / chase / return</summary>
        public string state = "idle";
        public double atkCd;
        public double wanderCd;
        public double vx;
        public double vy;

        public List<Buff> buffs = new List<Buff>();
        /// <summary>受击闪白剩余时长</summary>
        public double flash;
        /// <summary>抬手特效剩余时长</summary>
        public double castFx;
        public bool dead;

        /// <summary>
        /// 是不是这张图的「那只」首领。
        ///
        /// 注意它和 def.isBoss 不是一回事：def.isBoss 说的是这个怪的定位，
        /// 而这个字段只有 SpawnBoss 生成的那只才为 true。刷怪表里要是混进一只
        /// boss 定位的怪，它照样会脱战回家、也不会触发首领重生计时——
        /// 这是 JS 版的行为，照搬过来。
        /// </summary>
        public bool isBoss;
    }

    /// <summary>掉在地上的东西</summary>
    [Serializable]
    public class DropItem
    {
        public int uid;
        public string id;
        public int n;
        public double x;
        public double y;
        /// <summary>剩余寿命（毫秒），归零就消失</summary>
        public double life;
        /// <summary>已经躺了多久，渲染层拿它做弹出动画</summary>
        public double born;
    }

    /// <summary>场上的矩形障碍（像素坐标）</summary>
    [Serializable]
    public class BlockRect
    {
        public double x;
        public double y;
        public double w;
        public double h;
    }

    /// <summary>传送门</summary>
    [Serializable]
    public class PortalInstance
    {
        public string to;
        public double x;
        public double y;
        public double r;
    }

    /// <summary>站在图上的 NPC</summary>
    [Serializable]
    public class NpcInstance
    {
        public ZxNpc def;
        public double x;
        public double y;
        public double r;
    }

    /// <summary>按 E 能交互的东西</summary>
    public class Interactable
    {
        /// <summary>npc / portal</summary>
        public string Kind;
        public NpcInstance Npc;
        public PortalInstance Portal;
    }

    /// <summary>
    /// 世界推进时的回调。怪物打到玩家、持续伤害跳字、怪物死亡——
    /// 这些的后续（扣血、发经验、结算任务）由调用方决定，World 只管通知。
    /// </summary>
    public interface IWorldHooks
    {
        void OnHitPlayer(MonsterInstance monster);
        void OnDot(MonsterInstance monster, int amount);
        void OnDeath(MonsterInstance monster);
    }

    /// <summary>什么都不做的默认实现，省掉一路 null 判断</summary>
    public sealed class NoWorldHooks : IWorldHooks
    {
        public static readonly NoWorldHooks Instance = new NoWorldHooks();

        public void OnHitPlayer(MonsterInstance monster)
        {
        }

        public void OnDot(MonsterInstance monster, int amount)
        {
        }

        public void OnDeath(MonsterInstance monster)
        {
        }
    }
}
