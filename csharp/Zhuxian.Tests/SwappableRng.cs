using Zhuxian.Core;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 可以中途换掉内层随机源。
    ///
    /// 对照样本里「建图」和「推进」用的是两个不同的种子，而 World 只在构造时
    /// 拿一次 IRng。与其给 World 开个换随机源的口子（那是为测试改生产代码），
    /// 不如让传进去的这个 IRng 自己可切换。
    /// </summary>
    internal sealed class SwappableRng : IRng
    {
        public IRng Inner;

        public SwappableRng(IRng inner)
        {
            Inner = inner;
        }

        public double Next()
        {
            return Inner.Next();
        }
    }
}
