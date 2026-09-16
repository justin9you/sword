// 最小 Godot 桩，只为让 export/godot/ 下的代码在没装 Godot 的机器上编译得过。
//
// 这个文件绝对不能进 export/：真到了 Godot 工程里，它会和真正的 Godot 程序集
// 撞成一堆二义性引用错误。
//
// 坦白一句：桩是照着 Godot 4.x 的 API 写的，但它只能证明"我们的代码自洽"，
// 不能证明"和真 Godot 的签名一致"——万一 FileAccess.GetAsText 之类的名字对不上，
// 这里照样绿。所以碰 Godot API 的地方刻意压到最少（就 FileAccess、GD.Print、Node），
// 第一次在 Godot 里跑的时候重点看这几处。

using System;

namespace Godot
{
    public class GodotObject : IDisposable
    {
        public void Dispose()
        {
        }
    }

    public class RefCounted : GodotObject
    {
    }

    public class Node : GodotObject
    {
        public virtual void _Ready()
        {
        }
    }

    public class FileAccess : RefCounted
    {
        public enum ModeFlags
        {
            Read = 1,
            Write = 2,
        }

        public static FileAccess Open(string path, ModeFlags flags)
        {
            return null;
        }

        public string GetAsText(bool skipCr = false)
        {
            return null;
        }
    }

    public static class GD
    {
        public static void Print(params object[] what)
        {
        }

        public static void PrintErr(params object[] what)
        {
        }
    }
}
