using System;
using System.IO;
using System.Text.Json;

namespace Zhuxian.Tests
{
    /// <summary>
    /// 读 tools/gen-fixtures.mjs 生成的对照样本，以及 export/ 下的游戏数据。
    ///
    /// 样本文件跟着仓库走，所以跑测试不需要装 Node——只有样本要重新生成时才需要。
    /// </summary>
    public static class Fixtures
    {
        static readonly JsonSerializerOptions Options = new JsonSerializerOptions
        {
            // 数据类用的是公开字段（Unity 的 JsonUtility 只认字段），
            // System.Text.Json 默认只看属性，这里必须显式打开
            IncludeFields = true,
            PropertyNameCaseInsensitive = false,
            ReadCommentHandling = JsonCommentHandling.Skip,
        };

        /// <summary>仓库根目录。从可执行文件往上找，找到有 package.json 的那一层。</summary>
        public static string RepoRoot
        {
            get
            {
                var dir = new DirectoryInfo(AppContext.BaseDirectory);
                while (dir != null && !File.Exists(Path.Combine(dir.FullName, "package.json")))
                {
                    dir = dir.Parent;
                }
                if (dir == null)
                {
                    throw new InvalidOperationException(
                        "从 " + AppContext.BaseDirectory + " 往上没找到 package.json，定位不了仓库根目录");
                }
                return dir.FullName;
            }
        }

        public static T Load<T>(string fixtureName)
        {
            return Read<T>(Path.Combine(RepoRoot, "csharp", "Zhuxian.Tests", "fixtures", fixtureName),
                "对照样本缺失，跑一下：npm run gen:fixtures");
        }

        public static T LoadGameData<T>(string jsonName)
        {
            return Read<T>(
                Path.Combine(RepoRoot, "export", "unity", "Resources", "ZhuxianData", jsonName),
                "游戏数据缺失，跑一下：npm run export:unity");
        }

        static T Read<T>(string file, string hint)
        {
            if (!File.Exists(file))
            {
                throw new FileNotFoundException(file + " 不存在 —— " + hint, file);
            }
            var json = File.ReadAllText(file);
            var value = JsonSerializer.Deserialize<T>(json, Options);
            if (value == null)
            {
                throw new InvalidOperationException(file + " 解析出来是空的");
            }
            return value;
        }
    }
}
