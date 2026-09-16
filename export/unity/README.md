# Unity 适配器

## 装进工程

1. `../data/ZxData.cs` 和本目录下的 `ZxDatabase.cs`、`ZxSmokeTest.cs`
   拖到 `Assets/` 下任意位置（脚本放哪都行）
2. `../data/` 下的 7 份 JSON 放进 `Assets/Resources/ZhuxianData/`
   （路径必须是这个，`ZxDatabase` 按它 Load）
3. 想连游戏逻辑一起用，再把 [csharp/Zhuxian.Core](../../csharp/Zhuxian.Core) 下的
   `.cs` 也拖进 `Assets/`

## 用

```csharp
using Zhuxian.Data;

var db = ZxDatabase.Load();

ZxItem sword   = db.Item("w_qingyunjian");
ZxMonster wolf = db.Monster("yegou");
ZxMap village  = db.Map("caomiao");
ZxSect qingyun = db.Sect("qingyun");

foreach (var npc in db.NpcsOnMap("caomiao")) Debug.Log(npc.name);

int expNeeded = db.ExpToNext(12);   // 12 级升 13 级要多少经验
int tile      = db.config.TILE;     // 地图坐标单位是「格」，乘它变像素
```

## 先验一下通没通

把 `ZxSmokeTest` 挂到场景里任意一个 GameObject 上，按 Play。Console 会打出各表条数、
几个抽样查询、以及几个已知坑的验证结果——全绿就说明数据管道通了。不想按 Play 的话，
在 Inspector 里右键这个组件 →「跑一遍数据包冒烟测试」也行。

出错时它会把话说明白，比如目录没放对会直接告诉你该放哪儿。

数据部分的注意事项见 [上一层的 README](../README.md)。
