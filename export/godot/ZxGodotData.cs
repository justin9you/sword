// Godot 侧的数据加载器：把 res:// 下的 JSON 读成 Zhuxian.Core 的 GameData。
//
// 和 Unity 那边的 ZxDatabase 是同一件事的两个实现——差别只在"文件怎么读进来"：
// Unity 走 Resources.Load<TextAsset> + JsonUtility，Godot 走 FileAccess +
// System.Text.Json。数据类和索引逻辑都是共用的，没有第二份。
//
// 由 tools/export-gamedata.mjs 原样拷进 export/godot/。

using System;
using System.Text.Json;
using Godot;
using Zhuxian.Core;
using Zhuxian.Data;

namespace Zhuxian.Godot
{
    public static class ZxGodotData
    {
        /// <summary>JSON 放在哪儿。想换目录改这里，或者调 Load(dir) 指定</summary>
        public const string DataDir = "res://data/zhuxian/";

        static readonly JsonSerializerOptions Options = new JsonSerializerOptions
        {
            // 数据类用的是公开字段（Unity 的 JsonUtility 只认字段），
            // System.Text.Json 默认只看属性，这里必须显式打开
            IncludeFields = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
        };

        static GameData cached;

        /// <summary>加载一次并缓存。数据是只读的，全局共用一份就够</summary>
        public static GameData Load(string dir = DataDir)
        {
            if (cached != null) return cached;

            cached = new GameData(
                Read<ZxConfig>(dir, "config"),
                Read<ZxItemList>(dir, "items").items,
                Read<ZxMonsterList>(dir, "monsters").monsters,
                Read<ZxMapList>(dir, "maps").maps,
                Read<ZxNpcList>(dir, "npcs").npcs,
                Read<ZxQuestList>(dir, "quests").quests,
                Read<ZxSectList>(dir, "sects").sects);
            return cached;
        }

        /// <summary>热重载 / 编辑器里改了 JSON 想立刻看到效果时用</summary>
        public static void Clear()
        {
            cached = null;
        }

        static T Read<T>(string dir, string name)
        {
            var path = dir + name + ".json";

            using var file = FileAccess.Open(path, FileAccess.ModeFlags.Read);
            if (file == null)
            {
                throw new InvalidOperationException(
                    "读不到 " + path + " —— 确认 7 份 JSON 放在了这个目录下；" +
                    "导出项目时还要在「项目 → 导出 → 资源」里把 *.json 加进筛选");
            }

            var text = file.GetAsText();
            var value = JsonSerializer.Deserialize<T>(text, Options);
            if (value == null)
            {
                throw new InvalidOperationException(path + " 解析出来是空的，文件可能被截断了");
            }
            return value;
        }
    }
}
