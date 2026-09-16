using System;
using System.Collections.Generic;
using Zhuxian.Data;

namespace Zhuxian.Core
{
    /// <summary>
    /// 一次命中的参数。对应 skills.js 里那个 opt 对象。
    ///
    /// 技能定义（ZxSectSkill）和法宝主动（ZxItemActive）都会摊平成它，
    /// 这样命中结算只有一个口径——各种技能形状只是"打到谁"不同，
    /// "打多疼"的算法必须是同一套。
    /// </summary>
    public class HitOptions
    {
        /// <summary>phys 或 magic</summary>
        public string Dmg;
        public double Power;
        public double Lifesteal;

        public double Burn;
        public double BurnMs;
        public double Poison;
        public double PoisonMs;

        public double StunMs;
        public double CharmMs;
        public double Slow;
        public double SlowMs;
        /// <summary>击退距离（像素）</summary>
        public double Knock;

        /// <summary>多段攻击的段数，0 当 1 算</summary>
        public int Hits;
        public double Range;
        public double Speed;
        public double Width;
        public double Radius;
        public string Color;
    }

    /// <summary>飞行物：弹丸 / 穿透剑气 / 落点爆炸的飞行阶段</summary>
    [Serializable]
    public class Bolt
    {
        public int uid;
        /// <summary>bolt / pierce / blast</summary>
        public string kind;
        public double x;
        public double y;
        public double dx;
        public double dy;
        public double speed;
        /// <summary>还能飞多远（像素）</summary>
        public double left;
        public double width;
        /// <summary>blast 的落点</summary>
        public double tx;
        public double ty;
        public HitOptions opt;
        /// <summary>已经打过的怪，避免同一发打同一只两次</summary>
        public HashSet<int> hit = new HashSet<int>();
        public string color;
    }

    /// <summary>
    /// 一个特效。逻辑层只负责生成和计时，画成什么样是渲染层的事。
    /// 放在 Core 而不是渲染层，是因为它的产生时机和命中结算绑死——
    /// 挪出去就得把结算过程再讲一遍。
    /// </summary>
    [Serializable]
    public class VisualFx
    {
        /// <summary>impact / nova / slash / ring / spark</summary>
        public string kind;
        public double x;
        public double y;
        public double r;
        /// <summary>总时长</summary>
        public double ms;
        /// <summary>剩余时长</summary>
        public double life;
        public string color;
        /// <summary>slash 的朝向</summary>
        public double ax;
        public double ay;
        /// <summary>跟着玩家走（护体光环那类）</summary>
        public bool follow;
    }

    /// <summary>场上的飞行物与特效</summary>
    public class FxState
    {
        public List<Bolt> Bolts { get; } = new List<Bolt>();
        public List<VisualFx> Visuals { get; } = new List<VisualFx>();
    }

    /// <summary>
    /// 逻辑层向外抛的事件。飘字、音效、日志——这些怎么呈现由宿主决定，
    /// Core 只负责在对的时机喊一声。
    /// </summary>
    public interface IGameHooks : IWorldHooks
    {
        /// <summary>伤害 / 治疗飘字。kind 是 hit / crit / heal / hurt</summary>
        void Floater(double x, double y, double amount, string kind);
        void Sfx(string name);
        void Log(string message, string kind);
        void OnCast(ZxSectSkill skill);
    }

    /// <summary>什么都不做的默认实现</summary>
    public sealed class NoGameHooks : IGameHooks
    {
        public static readonly NoGameHooks Instance = new NoGameHooks();

        public void OnHitPlayer(MonsterInstance monster) { }
        public void OnDot(MonsterInstance monster, int amount) { }
        public void OnDeath(MonsterInstance monster) { }
        public void Floater(double x, double y, double amount, string kind) { }
        public void Sfx(string name) { }
        public void Log(string message, string kind) { }
        public void OnCast(ZxSectSkill skill) { }
    }

    /// <summary>
    /// 一局游戏的运行时上下文。对应 main.js 里那个 game 对象——
    /// 玩家、当前这张图、特效、以及往外抛事件的钩子。
    /// </summary>
    public class GameContext
    {
        public GameData Data { get; }
        public IRng Rng { get; }
        public PlayerState Player { get; set; }
        public World World { get; set; }
        public FxState Fx { get; } = new FxState();
        public IGameHooks Hooks { get; set; }

        public GameContext(GameData data, IRng rng, PlayerState player, World world, IGameHooks hooks = null)
        {
            Data = data ?? throw new ArgumentNullException(nameof(data));
            Rng = rng ?? throw new ArgumentNullException(nameof(rng));
            Player = player;
            World = world;
            Hooks = hooks ?? NoGameHooks.Instance;
        }
    }

    /// <summary>释放技能的结果。失败时 Message 是给玩家看的人话</summary>
    public readonly struct CastResult
    {
        public readonly bool Ok;
        public readonly string Message;

        public CastResult(bool ok, string message = null)
        {
            Ok = ok;
            Message = message;
        }

        public static readonly CastResult Success = new CastResult(true);

        public static CastResult Fail(string message)
        {
            return new CastResult(false, message);
        }
    }
}
