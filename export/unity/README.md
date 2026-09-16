# 诛仙数据包（Unity）

由 `tools/export-unity.mjs` 从 [src/data](../../src/data) 生成，**不要手改这个目录**——
改数据请改 `src/data/*.js`，然后重跑 `npm run export:unity`。

## 装进工程

1. `Runtime/` 两个 .cs 拖到 `Assets/` 下任意位置（脚本放哪都行）
2. `Resources/ZhuxianData/` 整个拖到 `Assets/Resources/` 下
   （路径必须是 `Assets/Resources/ZhuxianData/`，`ZxDatabase` 按这个路径 Load）

## 用

```csharp
using Zhuxian.Data;

var db = ZxDatabase.Load();

ZxItem sword   = db.Item("w_qingyunjian");
ZxMonster wolf = db.Monster("yegou");
ZxMap village  = db.Map("caomiao");
ZxSect qingyun = db.Sect("qingyun");

foreach (var npc in db.NpcsOnMap("caomiao")) Debug.Log(npc.name);

int expNeeded = db.ExpToNext(12);       // 12 级升 13 级要多少经验
float tile    = db.config.TILE;         // 地图坐标单位是「格」，乘它变像素
```

## 内容

| 文件 | 条数 | C# 类 |
|---|---|---|
| `items.json` | 67 | `ZxItem` |
| `monsters.json` | 55 | `ZxMonster` |
| `maps.json` | 12 | `ZxMap` |
| `npcs.json` | 12 | `ZxNpc` |
| `quests.json` | 15 | `ZxQuest` |
| `sects.json` | 4 | `ZxSect` |
| `config.json` | — | `ZxConfig` |

## 几处和 JS 侧不一样的地方

Unity 的 JsonUtility 不认字典，也不认顶层数组，所以导出时改了三处结构：

| JS 里 | JSON 里 |
|---|---|
| `map.decor` 是 `{tree: 26, rock: 10}` | `[{"kind":"tree","count":26}, ...]` |
| `map.lv` 是 `[1, 5]` | `lvMin: 1`, `lvMax: 5` |
| `ZX.QUALITY` 是按品质 key 索引的字典 | `config.quality` 数组，品质 key 进 `key` 字段 |

### 可选字段别拿 null 判断

JS 里判断一件装备有没有主动效果就是 `if (item.active)`，**这招在 Unity 失效**：
JsonUtility 不给可序列化类留 null，JSON 里没有的字段会变成一个字段全是 0 的实例。
所以可选的对象字段都带了一个 `present` 标记：

```csharp
if (item.active.present) { /* 有主动效果 */ }   // ✅
if (item.active != null) { /* 永远成立 */ }     // ❌
```

目前带 `present` 的有 `item.stats`、`item.active`、`item.use`、`map.boss`。
数组字段不用这个标记，但也不用担心：导出时已经把缺席的数组补成 `[]` 了
（比如 8 个不卖东西的 NPC 都有 `"stock": []`），所以 `foreach` 直接上，不会遇到 null。

另外几件值得知道的事：

- **怪物数值是终值**。`exp`/`gold`/`atkMs`/`attackRange`/`isBoss`/`isElite` 在 `monsters.js`
  加载时按 role 模板算好，这里导的是算完的结果，Unity 侧不用再翻公式。
- **坐标单位是格**，不是像素。渲染时乘 `config.TILE`（48）。怪物的 `radius`、
  技能的 `range`/`radius` 这些反过来，本来就是像素。
- **`config.expToNext` 是查表**，`expToNext[lv-1]` = 从 lv 升到 lv+1 要的经验，到满级
  （`MAX_LEVEL` = 65）为止。
- **数值是 int / double，不是 float**。字段类型照着当前数据推：现在恰好全是整数就生成
  `int`，以后调成小数会自动变 `double`——前提是你重跑了导出。
  用 double 而不是 Unity 更常见的 float，是因为这些数值的真身是 JS 里的双精度：
  存成 float 在写入那一刻就变了样（`9.4f` 实际是 9.400000095…），等级一乘、取整一落，
  算出来的气血就和网页版差 1。这不是洁癖，是 csharp/ 那边的对照测试真的因此红过。
- **可选的数字 / 布尔 / 字符串字段缺席时是 0 / false / null**，和 JS 里 `undefined` 的判断
  一模一样，直接翻就行：`if (it.sect)` → `if (!string.IsNullOrEmpty(it.sect))`，
  `if (sk.burn)` → `if (sk.burn > 0)`。技能的 `dmg`、任务 `goal` 的 `monster`/`id` 都属于这类，
  按 `kind` / `type` 分支就不会读到不该读的字段。

## 还没带过来的东西

这一步只搬数据。这些还在 JS 里，等逻辑层移植时再翻：

- 战斗公式（`src/combat.js`）、属性换算（`src/stats.js`）、掉落规则（`ITEMS.rollGear`）
- 技能行为（`src/skills.js` 按 `kind` 解释：bolt / pierce / blast / strike / nova / buff / heal）
- 任务状态机（`src/quest.js`）、背包堆叠（`src/inventory.js`）、刷怪与仇恨（`src/world.js`）
