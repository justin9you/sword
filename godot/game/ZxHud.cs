// 抬头显示：血蓝经验、地图信息、技能栏、日志、交互提示、死亡遮罩。
//
// 全部用代码搭，不依赖 .tscn——这样改一行就能看到效果，不用开编辑器拖控件。
// 界面本身不存状态，每帧从 PlayerState / World 读，读到什么显示什么。

using System.Collections.Generic;
using Godot;
using Zhuxian.Core;
using Zhuxian.Data;

namespace Zhuxian.Godot
{
    public partial class ZxHud : CanvasLayer
    {
        const int LogLines = 6;

        Label title;
        Label right;
        Label hint;
        Label skills;
        Label logBox;
        Label help;
        ColorRect deathVeil;
        Label deathText;
        Bar hp;
        Bar mp;
        Bar exp;

        readonly List<string> lines = new List<string>();

        class Bar
        {
            public ColorRect Fill;
            public float Width;
            public void Set(double frac)
            {
                var k = Mathf.Clamp((float)frac, 0f, 1f);
                Fill.Size = new Vector2(Width * k, Fill.Size.Y);
            }
        }

        public static ZxHud Build()
        {
            var hud = new ZxHud { Name = "Hud" };
            var root = new Control
            {
                AnchorRight = 1,
                AnchorBottom = 1,
                MouseFilter = Control.MouseFilterEnum.Ignore,
                Theme = new Theme { DefaultFont = ZxFont.Get(), DefaultFontSize = 15 },
            };
            hud.AddChild(root);

            hud.BuildLeft(root);
            hud.BuildRight(root);
            hud.BuildBottom(root);
            hud.BuildCenter(root);
            return hud;
        }

        // ── 搭界面 ──────────────────────────────────────────────

        void BuildLeft(Control root)
        {
            var panel = Panel(root, new Vector2(16, 14), new Vector2(268, 104));
            title = Text(panel, new Vector2(12, 8), 17, new Color(0.12f, 0.13f, 0.16f));
            hp = MakeBar(panel, new Vector2(12, 36), 244, new Color(0.68f, 0.17f, 0.14f));
            mp = MakeBar(panel, new Vector2(12, 58), 244, new Color(0.24f, 0.36f, 0.55f));
            exp = MakeBar(panel, new Vector2(12, 80), 244, new Color(0.55f, 0.44f, 0.22f));
        }

        void BuildRight(Control root)
        {
            var panel = Panel(root, new Vector2(-292, 14), new Vector2(276, 72));
            panel.AnchorLeft = 1;
            panel.AnchorRight = 1;
            right = Text(panel, new Vector2(12, 8), 15, new Color(0.14f, 0.15f, 0.18f));
        }

        void BuildBottom(Control root)
        {
            logBox = Text(root, new Vector2(18, -158), 14, new Color(0.20f, 0.21f, 0.24f));
            logBox.AnchorTop = 1;
            logBox.AnchorBottom = 1;
            logBox.Size = new Vector2(520, 140);

            skills = Text(root, new Vector2(18, -40), 15, new Color(0.14f, 0.15f, 0.18f));
            skills.AnchorTop = 1;
            skills.AnchorBottom = 1;
            skills.Size = new Vector2(760, 24);

            help = Text(root, new Vector2(-470, -40), 13, new Color(0.38f, 0.39f, 0.42f));
            help.AnchorLeft = 1;
            help.AnchorRight = 1;
            help.AnchorTop = 1;
            help.AnchorBottom = 1;
            help.Size = new Vector2(452, 24);
            help.Text = "WASD 走  空格 普攻  1-4 技能  R 法宝  F 交互  H 丹药  右键拖动转视角  滚轮缩放";
        }

        void BuildCenter(Control root)
        {
            hint = Text(root, new Vector2(-190, -120), 17, new Color(0.62f, 0.24f, 0.18f));
            hint.AnchorLeft = 0.5f;
            hint.AnchorRight = 0.5f;
            hint.AnchorTop = 1;
            hint.AnchorBottom = 1;
            hint.Size = new Vector2(380, 26);
            hint.HorizontalAlignment = HorizontalAlignment.Center;

            deathVeil = new ColorRect
            {
                Color = new Color(0.15f, 0.14f, 0.16f, 0.30f),
                AnchorRight = 1,
                AnchorBottom = 1,
                MouseFilter = Control.MouseFilterEnum.Ignore,
                Visible = false,
            };
            root.AddChild(deathVeil);

            deathText = Text(deathVeil, new Vector2(-180, -30), 30, new Color(0.68f, 0.17f, 0.14f));
            deathText.AnchorLeft = 0.5f;
            deathText.AnchorRight = 0.5f;
            deathText.AnchorTop = 0.5f;
            deathText.AnchorBottom = 0.5f;
            deathText.Size = new Vector2(360, 60);
            deathText.HorizontalAlignment = HorizontalAlignment.Center;
            deathText.Text = "你倒下了\n按 R 原地复活";
        }

        static Control Panel(Control parent, Vector2 pos, Vector2 size)
        {
            var p = new ColorRect
            {
                Color = new Color(0.97f, 0.95f, 0.90f, 0.80f),
                Position = pos,
                Size = size,
                MouseFilter = Control.MouseFilterEnum.Ignore,
            };
            parent.AddChild(p);
            return p;
        }

        static Label Text(Control parent, Vector2 pos, int size, Color color)
        {
            var l = new Label { Position = pos, MouseFilter = Control.MouseFilterEnum.Ignore };
            l.AddThemeFontOverride("font", ZxFont.Get());
            l.AddThemeFontSizeOverride("font_size", size);
            l.AddThemeColorOverride("font_color", color);
            l.AddThemeColorOverride("font_outline_color", new Color(0.98f, 0.96f, 0.92f, 0.9f));
            l.AddThemeConstantOverride("outline_size", 4);
            parent.AddChild(l);
            return l;
        }

        static Bar MakeBar(Control parent, Vector2 pos, float width, Color color)
        {
            var bg = new ColorRect
            {
                Color = new Color(0.20f, 0.19f, 0.17f, 0.22f),
                Position = pos,
                Size = new Vector2(width, 14),
                MouseFilter = Control.MouseFilterEnum.Ignore,
            };
            parent.AddChild(bg);

            var fill = new ColorRect
            {
                Color = color,
                Position = Vector2.Zero,
                Size = new Vector2(width, 14),
                MouseFilter = Control.MouseFilterEnum.Ignore,
            };
            bg.AddChild(fill);
            return new Bar { Fill = fill, Width = width };
        }

        // ── 每帧刷新 ────────────────────────────────────────────

        public void Refresh(GameData data, PlayerState p, World world)
        {
            var sect = data.Sect(p.sect);
            title.Text = p.name + " · " + (sect != null ? sect.name : "散修") + "  " + p.level + " 级";

            hp.Set(p.stats.hp > 0 ? p.hp / p.stats.hp : 0);
            mp.Set(p.stats.mp > 0 ? p.mp / p.stats.mp : 0);
            var need = Stats.ExpToNext(p.level, data.Config);
            exp.Set(need > 0 ? (double)p.exp / need : 1);

            var alive = 0;
            for (var i = 0; i < world.Monsters.Count; i++)
            {
                if (!world.Monsters[i].dead) alive++;
            }

            var quest = Quest.Current(data, p);
            right.Text =
                world.Def.name + "  " + world.Def.lvMin + "-" + world.Def.lvMax + " 级\n" +
                "气血 " + (int)p.hp + "/" + (int)p.stats.hp + "   灵力 " + (int)p.mp + "/" + (int)p.stats.mp + "\n" +
                (quest != null ? "任务：" + quest.name + " " + p.quest.progress + "/" + quest.goal.count : "在场 " + alive + " 只");
        }

        /// <summary>技能栏。冷却和灵力都在这儿显示，按不出来要看得见是为什么</summary>
        public void RefreshSkills(ZxSect sect, PlayerState p)
        {
            if (sect == null || sect.skills == null) return;
            var text = "";
            for (var i = 0; i < sect.skills.Length && i < 4; i++)
            {
                var s = sect.skills[i];
                double cd;
                p.cd.TryGetValue(s.key, out cd);

                string tag;
                if (p.level < s.lv) tag = s.lv + " 级解锁";
                else if (cd > 0) tag = (cd / 1000).ToString("0.0") + "s";
                else if (p.mp < s.mp) tag = "灵力不足";
                else tag = "就绪";

                text += "[" + (i + 1) + "] " + s.name + " (" + tag + ")   ";
            }
            skills.Text = text;
        }

        public void SetHint(string text)
        {
            hint.Text = text ?? "";
        }

        public void SetDead(bool dead)
        {
            deathVeil.Visible = dead;
        }

        public void Log(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            lines.Add(text);
            while (lines.Count > LogLines) lines.RemoveAt(0);
            logBox.Text = string.Join("\n", lines);
        }
    }
}
