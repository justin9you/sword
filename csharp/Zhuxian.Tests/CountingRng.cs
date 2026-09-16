using Zhuxian.Core;

namespace Zhuxian.Tests
{
    /// <summary>数一下取了几个随机数。消耗顺序/个数对不上，是移植最隐蔽的一类偏差。</summary>
    internal sealed class CountingRng : IRng
    {
        readonly IRng inner;
        public int Count { get; private set; }

        public CountingRng(IRng inner)
        {
            this.inner = inner;
        }

        public double Next()
        {
            Count++;
            return inner.Next();
        }
    }
}
