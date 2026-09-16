# Godot 适配器

仓库里已经有一个配好的 Godot 工程了：[godot/](../../godot)。这个目录只是那个工程
用到的适配器源码（由导出器同步过去，改这边不用手动拷）。

## 直接用现成的工程

```bash
npm run smoke:godot     # 无头跑一遍冒烟测试，不开编辑器
```

要开编辑器的话，用 Godot 打开 `godot/project.godot`，按 F5。

实测环境：**Godot 4.7.2 .NET 版 + .NET 8 SDK**，27 项冒烟检查全过
（数据加载 → 建号 → 建图 → 打一架 → 存档往返）。

没装的话这两条搞定，都不用注册账号：

```powershell
winget install GodotEngine.GodotEngine.Mono   # Godot 的 .NET 版，别下成普通版
winget install Microsoft.DotNet.SDK.8         # Godot 4.2+ 的 C# 工程要它，注意是 SDK
```

## 工程是怎么拼的

```
godot/
├── project.godot        主场景指向 main.tscn
├── Zhuxian3D.csproj     直接编译仓库里的源码，不拷贝
├── main.tscn            根节点挂着 ZxSmoke
├── scripts/             适配器 + 冒烟脚本（导出器生成）
└── data/zhuxian/        7 份 JSON（导出器生成）
```

两条不拷贝源码的路子：

- **数据类和逻辑层**由 `.csproj` 直接 `Compile Include` 仓库里那一份，
  改了 `Zhuxian.Core` 下次编译就跟上
- **JSON 和挂在节点上的脚本**必须落在 `res://` 底下，所以由 `npm run export:data`
  一起生成——也不用手动同步，`npm run test:data` 会盯着它们有没有过期

## 自己起一个工程的话

1. 本目录的 `ZxGodotData.cs`、`ZxSmoke.cs` 和 `../data/ZxData.cs` 放进项目
   （挂到节点上的脚本必须在 `res://` 底下）
2. `../data/` 下的 7 份 JSON 放进 `res://data/zhuxian/`
   （想换路径就改 `ZxGodotData.DataDir`）
3. `.csproj` 里引用逻辑层：

```xml
<Compile Include="..\csharp\Zhuxian.Core\*.cs" />
```

Core 是 netstandard2.1，Godot 的 net8.0 工程吃得下。

## 用

```csharp
using Zhuxian.Core;

var data   = ZxGodotData.Load();               // 读 JSON，建好索引
var player = Player.Create(data, "张小凡", "qingyun");
var world  = new World(data, new SystemRng(), "caomiao");

GD.Print(player.stats.hp);                     // 气血
GD.Print(world.Monsters.Count);                // 这张图上的怪
```

## 导出成品时别把 JSON 漏了

Godot 导出项目时，非资源文件（`.json`）默认可能不进包。在
「项目 → 导出 → 资源」里把 `*.json` 加进筛选，否则编辑器里跑得好好的，
导出的包一启动就报找不到数据。

数据部分的注意事项见 [上一层的 README](../README.md)。
