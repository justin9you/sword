# Godot 适配器

对着 Godot 4.x 的 .NET 版写的。Godot 有两个下载：普通版和 **.NET 版**，要下后者。

## 先装两样

| 装什么 | 说明 |
|---|---|
| Godot 4.x **.NET 版** | 约 130MB，解压即用，不用注册登录 |
| **.NET 8 SDK** | Godot 4.2+ 的 C# 工程要它。注意是 SDK 不是运行时 |

装完在 Godot 里新建一个项目，随便建个场景。

## 装进工程

1. 本目录的 `ZxGodotData.cs`、`ZxSmoke.cs` 和 `../data/ZxData.cs`
   放进项目里任意目录（比如 `res://scripts/`）
2. `../data/` 下的 7 份 JSON 放进 `res://data/zhuxian/`
   （想换路径就改 `ZxGodotData.DataDir`）
3. 游戏逻辑在 [csharp/Zhuxian.Core](../../csharp/Zhuxian.Core)：
   `.csproj` 里加一条项目引用，或者把那些 `.cs` 直接拷进项目

```xml
<ItemGroup>
  <ProjectReference Include="..\\path\\to\\csharp\\Zhuxian.Core\\Zhuxian.Core.csproj" />
</ItemGroup>
```

Core 是 netstandard2.1，Godot 的 net8.0 工程引得动。

## 用

```csharp
using Zhuxian.Core;

var data   = ZxGodotData.Load();               // 读 JSON，建好索引
var player = Player.Create(data, "张小凡", "qingyun");
var world  = new World(data, new SystemRng(), "caomiao");

GD.Print(player.stats.hp);                     // 气血
GD.Print(world.Monsters.Count);                // 这张图上的怪
```

## 先验一下通没通

把 `ZxSmoke.cs` 挂到场景根节点上，按 F5。输出面板会依次跑：
数据加载 → 建号 → 建图 → 打一架 → 存档往返。全绿就说明**数据和逻辑两条链路都通了**。

比 Unity 那个冒烟脚本验得更多——因为 Godot 这边逻辑层是直接能用的。

## 导出时别把 JSON 漏了

Godot 导出项目时，非资源文件（`.json`）默认可能不进包。在
「项目 → 导出 → 资源」里把 `*.json` 加进筛选，否则编辑器里跑得好好的，
导出的包一启动就报找不到数据。

数据部分的注意事项见 [上一层的 README](../README.md)。
