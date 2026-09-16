// 最小 UnityEngine 桩，只为让 ZxDatabase.cs 在没有 Unity 的机器上编译得过。
//
// 它不模拟任何行为——方法体全是空的，Load 永远返回 null。这里要回答的问题只有
// 「这些代码的语法和类型对不对」，不是「跑起来对不对」。
//
// 这个文件绝对不能进 export/：真到了 Unity 工程里，它会和真正的 UnityEngine
// 撞成一堆二义性引用错误。

namespace UnityEngine
{
    public class Object
    {
    }

    public class TextAsset : Object
    {
        public string text;
    }

    public static class Resources
    {
        public static T Load<T>(string path) where T : Object
        {
            return null;
        }
    }

    public static class JsonUtility
    {
        public static T FromJson<T>(string json)
        {
            return default(T);
        }

        public static string ToJson(object obj)
        {
            return null;
        }
    }

    public static class Debug
    {
        public static void Log(object message)
        {
        }

        public static void LogWarning(object message)
        {
        }

        public static void LogError(object message)
        {
        }
    }
}
