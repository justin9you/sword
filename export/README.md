# 诛仙数据包

由 `tools/export-gamedata.mjs` 从 [src/data](../src/data) 生成，**不要手改这个目录**——
改数据请改 `src/data/*.js`，然后重跑 `npm run export:data`。

```
export/
├── data/     引擎无关：7 份 JSON + ZxData.cs（纯数据类，只 using System）
├── unity/    Unity 适配器：加载器 + 冒烟脚本
└── godot/    Godot 适配器：加载器 + 冒烟脚本
```

数据本身不挑引擎，两个适配器只解决"这个引擎怎么把文件读进来"。
要接第三个引擎，照着写一个加载器就行，`data/` 一个字都不用改。

游戏逻辑（战斗、背包、任务、技能、存档）不在这里，在 [csharp/Zhuxian.Core](../csharp/Zhuxian.Core)——
那是个 netstandard2.1 类库，两个引擎都吃得下。

## 内容

| 文件 | 条数 | C# 类 |
|---|---|---|
| `data/items.json` | 67 | `ZxItem` |
| `data/monsters.json` | 55 | `ZxMonster` |
| `data/maps.json` | 12 | `ZxMap` |
| `data/npcs.json` | 12 | `ZxNpc` |
| `data/quests.json` | 15 | `ZxQuest` |
| `data/sects.json` | 4 | `ZxSect` |
| `data/config.json` | — | `ZxConfig` |

## 几处和 JS 侧不一样的地方

JSON 是照着 Unity 的 JsonUtility 的口味导的（它不认字典，也不认顶层数组）。
Godot 用的是 System.Text.Json，本来没这些限制，但同一份数据两边共用，
所以这些改写对 Godot 也一样生效：

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
if (item.active.present) { /* 有主动效果 */ }   // ✅ 两个引擎都对
if (item.active != null) { /* Unity 里永远成立 */ } // ❌
```

带 `present` 的有 `item.stats`、`item.active`、`item.use`、`map.boss`。
数组字段不用这个标记：导出时已经把缺席的数组补成 `[]` 了（比如 8 个不卖东西的
NPC 都有 `"stock": []`），`foreach` 直接上，不会遇到 null。

另外几件值得知道的事：

- **怪物数值是终值**。`exp`/`gold`/`atkMs`/`attackRange`/`isBoss`/`isElite` 在
  `monsters.js` 加载时按 role 模板算好，这里导的是算完的结果，不用再翻公式。
- **坐标单位是格**，不是像素。渲染时乘 `config.TILE`（48）。怪物的 `radius`、
  技能的 `range`/`radius` 这些反过来，本来就是像素。
- **`config.expToNext` 是查表**，`expToNext[lv-1]` = 从 lv 升到 lv+1 要的经验，
  到满级（`MAX_LEVEL` = 65）为止。
- **数值是 int / double，不是 float**。字段类型照着当前数据推：现在恰好全是整数就生成
  `int`，以后调成小数会自动变 `double`——前提是你重跑了导出。
  用 double 而不是游戏引擎更常见的 float，是因为这些数值的真身是 JS 里的双精度：
  存成 float 在写入那一刻就变了样（`9.4f` 实际是 9.400000095…），等级一乘、取整一落，
  算出来的气血就和网页版差 1。这不是洁癖，是 csharp/ 那边的对照测试真的因此红过。
- **可选的数字 / 布尔 / 字符串字段缺席时是 0 / false / null**，和 JS 里 `undefined` 的
  判断一模一样：`if (it.sect)` → `if (!string.IsNullOrEmpty(it.sect))`，
  `if (sk.burn)` → `if (sk.burn > 0)`。
