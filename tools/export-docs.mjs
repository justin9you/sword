/**
 * 导出包里那几份说明文档。由 tools/export-gamedata.mjs 调用。
 *
 * 拆出来是因为导出器本身已经够长了，而文档又是最常改的部分——
 * 加一个引擎适配器、改一条注意事项，都只动这个文件。
 */

/** 数据部分的共同注意事项，两个引擎的说明都要用 */
function dataNotes(config) {
  return `## 几处和 JS 侧不一样的地方

JSON 是照着 Unity 的 JsonUtility 的口味导的（它不认字典，也不认顶层数组）。
Godot 用的是 System.Text.Json，本来没这些限制，但同一份数据两边共用，
所以这些改写对 Godot 也一样生效：

| JS 里 | JSON 里 |
|---|---|
| \`map.decor\` 是 \`{tree: 26, rock: 10}\` | \`[{"kind":"tree","count":26}, ...]\` |
| \`map.lv\` 是 \`[1, 5]\` | \`lvMin: 1\`, \`lvMax: 5\` |
| \`ZX.QUALITY\` 是按品质 key 索引的字典 | \`config.quality\` 数组，品质 key 进 \`key\` 字段 |

### 可选字段别拿 null 判断

JS 里判断一件装备有没有主动效果就是 \`if (item.active)\`，**这招在 Unity 失效**：
JsonUtility 不给可序列化类留 null，JSON 里没有的字段会变成一个字段全是 0 的实例。
所以可选的对象字段都带了一个 \`present\` 标记：

\`\`\`csharp
if (item.active.present) { /* 有主动效果 */ }   // ✅ 两个引擎都对
if (item.active != null) { /* Unity 里永远成立 */ } // ❌
\`\`\`

带 \`present\` 的有 \`item.stats\`、\`item.active\`、\`item.use\`、\`map.boss\`。
数组字段不用这个标记：导出时已经把缺席的数组补成 \`[]\` 了（比如 8 个不卖东西的
NPC 都有 \`"stock": []\`），\`foreach\` 直接上，不会遇到 null。

另外几件值得知道的事：

- **怪物数值是终值**。\`exp\`/\`gold\`/\`atkMs\`/\`attackRange\`/\`isBoss\`/\`isElite\` 在
  \`monsters.js\` 加载时按 role 模板算好，这里导的是算完的结果，不用再翻公式。
- **坐标单位是格**，不是像素。渲染时乘 \`config.TILE\`（${config.TILE}）。怪物的 \`radius\`、
  技能的 \`range\`/\`radius\` 这些反过来，本来就是像素。
- **\`config.expToNext\` 是查表**，\`expToNext[lv-1]\` = 从 lv 升到 lv+1 要的经验，
  到满级（\`MAX_LEVEL\` = ${config.MAX_LEVEL}）为止。
- **数值是 int / double，不是 float**。字段类型照着当前数据推：现在恰好全是整数就生成
  \`int\`，以后调成小数会自动变 \`double\`——前提是你重跑了导出。
  用 double 而不是游戏引擎更常见的 float，是因为这些数值的真身是 JS 里的双精度：
  存成 float 在写入那一刻就变了样（\`9.4f\` 实际是 9.400000095…），等级一乘、取整一落，
  算出来的气血就和网页版差 1。这不是洁癖，是 csharp/ 那边的对照测试真的因此红过。
- **可选的数字 / 布尔 / 字符串字段缺席时是 0 / false / null**，和 JS 里 \`undefined\` 的
  判断一模一样：\`if (it.sect)\` → \`if (!string.IsNullOrEmpty(it.sect))\`，
  \`if (sk.burn)\` → \`if (sk.burn > 0)\`。`;
}

/** export/README.md：进来先看这个 */
export function rootReadme(cols, config) {
  const rows = cols.map((c) => '| `data/' + c.file + '` | ' + c.rows.length + ' | `' + c.cls + '` |').join('\n');

  return `# 诛仙数据包

由 \`tools/export-gamedata.mjs\` 从 [src/data](../src/data) 生成，**不要手改这个目录**——
改数据请改 \`src/data/*.js\`，然后重跑 \`npm run export:data\`。

\`\`\`
export/
├── data/     引擎无关：7 份 JSON + ZxData.cs（纯数据类，只 using System）
├── unity/    Unity 适配器：加载器 + 冒烟脚本
└── godot/    Godot 适配器：加载器 + 冒烟脚本
\`\`\`

数据本身不挑引擎，两个适配器只解决"这个引擎怎么把文件读进来"。
要接第三个引擎，照着写一个加载器就行，\`data/\` 一个字都不用改。

游戏逻辑（战斗、背包、任务、技能、存档）不在这里，在 [csharp/Zhuxian.Core](../csharp/Zhuxian.Core)——
那是个 netstandard2.1 类库，两个引擎都吃得下。

## 内容

| 文件 | 条数 | C# 类 |
|---|---|---|
${rows}
| \`data/config.json\` | — | \`ZxConfig\` |

${dataNotes(config)}
`;
}

/** export/unity/README.md */
export function unityReadme(config) {
  return `# Unity 适配器

## 装进工程

1. \`../data/ZxData.cs\` 和本目录下的 \`ZxDatabase.cs\`、\`ZxSmokeTest.cs\`
   拖到 \`Assets/\` 下任意位置（脚本放哪都行）
2. \`../data/\` 下的 7 份 JSON 放进 \`Assets/Resources/ZhuxianData/\`
   （路径必须是这个，\`ZxDatabase\` 按它 Load）
3. 想连游戏逻辑一起用，再把 [csharp/Zhuxian.Core](../../csharp/Zhuxian.Core) 下的
   \`.cs\` 也拖进 \`Assets/\`

## 用

\`\`\`csharp
using Zhuxian.Data;

var db = ZxDatabase.Load();

ZxItem sword   = db.Item("w_qingyunjian");
ZxMonster wolf = db.Monster("yegou");
ZxMap village  = db.Map("caomiao");
ZxSect qingyun = db.Sect("qingyun");

foreach (var npc in db.NpcsOnMap("caomiao")) Debug.Log(npc.name);

int expNeeded = db.ExpToNext(12);   // 12 级升 13 级要多少经验
int tile      = db.config.TILE;     // 地图坐标单位是「格」，乘它变像素
\`\`\`

## 先验一下通没通

把 \`ZxSmokeTest\` 挂到场景里任意一个 GameObject 上，按 Play。Console 会打出各表条数、
几个抽样查询、以及几个已知坑的验证结果——全绿就说明数据管道通了。不想按 Play 的话，
在 Inspector 里右键这个组件 →「跑一遍数据包冒烟测试」也行。

出错时它会把话说明白，比如目录没放对会直接告诉你该放哪儿。

数据部分的注意事项见 [上一层的 README](../README.md)。
`;
}

/** export/godot/README.md */
export function godotReadme(config) {
  return `# Godot 适配器

仓库里已经有一个配好的 Godot 工程了：[godot/](../../godot)。这个目录只是那个工程
用到的适配器源码（由导出器同步过去，改这边不用手动拷）。

## 直接用现成的工程

\`\`\`bash
npm run smoke:godot     # 无头跑一遍冒烟测试，不开编辑器
\`\`\`

要开编辑器的话，用 Godot 打开 \`godot/project.godot\`，按 F5。

实测环境：**Godot 4.7.2 .NET 版 + .NET 8 SDK**，27 项冒烟检查全过
（数据加载 → 建号 → 建图 → 打一架 → 存档往返）。

没装的话这两条搞定，都不用注册账号：

\`\`\`powershell
winget install GodotEngine.GodotEngine.Mono   # Godot 的 .NET 版，别下成普通版
winget install Microsoft.DotNet.SDK.8         # Godot 4.2+ 的 C# 工程要它，注意是 SDK
\`\`\`

## 工程是怎么拼的

\`\`\`
godot/
├── project.godot        主场景指向 main.tscn
├── Zhuxian3D.csproj     直接编译仓库里的源码，不拷贝
├── main.tscn            根节点挂着 ZxSmoke
├── scripts/             适配器 + 冒烟脚本（导出器生成）
└── data/zhuxian/        7 份 JSON（导出器生成）
\`\`\`

两条不拷贝源码的路子：

- **数据类和逻辑层**由 \`.csproj\` 直接 \`Compile Include\` 仓库里那一份，
  改了 \`Zhuxian.Core\` 下次编译就跟上
- **JSON 和挂在节点上的脚本**必须落在 \`res://\` 底下，所以由 \`npm run export:data\`
  一起生成——也不用手动同步，\`npm run test:data\` 会盯着它们有没有过期

## 自己起一个工程的话

1. 本目录的 \`ZxGodotData.cs\`、\`ZxSmoke.cs\` 和 \`../data/ZxData.cs\` 放进项目
   （挂到节点上的脚本必须在 \`res://\` 底下）
2. \`../data/\` 下的 7 份 JSON 放进 \`res://data/zhuxian/\`
   （想换路径就改 \`ZxGodotData.DataDir\`）
3. \`.csproj\` 里引用逻辑层：

\`\`\`xml
<Compile Include="..\\csharp\\Zhuxian.Core\\*.cs" />
\`\`\`

Core 是 netstandard2.1，Godot 的 net8.0 工程吃得下。

## 用

\`\`\`csharp
using Zhuxian.Core;

var data   = ZxGodotData.Load();               // 读 JSON，建好索引
var player = Player.Create(data, "张小凡", "qingyun");
var world  = new World(data, new SystemRng(), "caomiao");

GD.Print(player.stats.hp);                     // 气血
GD.Print(world.Monsters.Count);                // 这张图上的怪
\`\`\`

## 导出成品时别把 JSON 漏了

Godot 导出项目时，非资源文件（\`.json\`）默认可能不进包。在
「项目 → 导出 → 资源」里把 \`*.json\` 加进筛选，否则编辑器里跑得好好的，
导出的包一启动就报找不到数据。

数据部分的注意事项见 [上一层的 README](../README.md)。
`;
}
