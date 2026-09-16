// 水墨材质。整个世界的物体都用它上色。
//
// 和写实渲染是两套逻辑，别拿 PBR 的直觉套：
//   · 没有投影。中国画里不画影子——去掉之后画面立刻「平」下来，那正是要的，
//     顺带把阴影图的开销整块省了。
//   · 明暗不是光强，是墨色浓淡。向光的一面留白（纸），背光的一面积墨，
//     中间按「墨分五色」分几档，档与档之间留一点软过渡，像水化开的边。
//   · 边缘要积墨。毛笔在轮廓收笔处停顿，墨会堆一圈——这一条比什么都像水墨，
//     缺了它就只是「灰色的卡通渲染」。
//   · 远处要淡。近浓远淡是国画的空间感来源（「远则无墨」），这里按视距把墨色
//     往纸色里化，远景自然就留白了。
//
// 颜色怎么来：数据里那份彩色（门派色、怪物色、生态色）不丢，但只留一点点，
// 当作「浅绛设色」压在墨色上——既守住水墨，又让玩家还能分得清敌我和生态。

using Godot;

namespace Zhuxian.Godot
{
    public static class ZxWash
    {
        const string Code = @"
shader_type spatial;
// 不吃引擎光照：墨色自己算。也就不需要阴影、不需要 PBR
render_mode unshaded, cull_back, depth_draw_opaque;

uniform vec4 paper : source_color = vec4(0.91, 0.88, 0.82, 1.0);
uniform vec4 ink : source_color = vec4(0.11, 0.12, 0.15, 1.0);
uniform vec4 tint : source_color = vec4(0.5, 0.5, 0.5, 1.0);

// 这一块的基准墨色：0 = 清（几乎是纸），1 = 焦（最浓）
uniform float density = 0.75;
// 设色的浓度。0 就是纯水墨
uniform float color_amount = 0.18;
// 边缘积墨的强度与宽度
uniform float edge_ink = 0.95;
uniform float edge_width = 1.5;
// 挨打时整块提亮（泼一笔清水）
uniform float flash = 0.0;

uniform sampler2D grain : hint_default_white, filter_linear_mipmap, repeat_enable;
uniform float grain_scale = 0.55;
uniform float grain_amount = 0.22;

// 近浓远淡
uniform float fade_start = 30.0;
uniform float fade_end = 88.0;

// 贴到镜头跟前就抖着剔掉（树冠、屋顶用）。0 = 不启用
uniform float near_fade = 0.0;

// 地面用：一张「一格一像素」的图，用来铺出极淡的格子
uniform sampler2D tile_tex : hint_default_white, filter_nearest;
uniform float tile_amount = 0.0;

varying vec3 world_pos;

void vertex() {
    world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
    float eye = length(world_pos - CAMERA_POSITION_WORLD);

    // 挡镜头的东西自己让开。
    //
    // 这里刻意用「一刀切」而不是按像素抖动剔除：抖动会在物体内部留下一片随机的洞，
    // 每个洞都是一处深度断层，全屏墨线（ZxInk）会忠实地把它们一个个描出来——
    // 结果是树冠上糊一层黑麻点。宁可让树整棵地闪一下。
    if (near_fade > 0.0 && eye < near_fade) discard;

    vec3 n = normalize(NORMAL);
    vec3 v = normalize(VIEW);

    // 光从固定方向来。用真光源没意义——这里要的不是照明，是「哪一面留白」
    // 压到侧前方。顶光在俯视镜头下没用——看得见的面全是受光面，满纸白
    vec3 sun = normalize(vec3(0.52, 0.40, 0.76));
    float lit = clamp(dot(n, sun), 0.0, 1.0);

    // 墨分五色：分档，但每档之间留一点过渡，像水化开的边
    float steps = 4.0;
    float q = floor(lit * steps) / steps;
    float frac = fract(lit * steps);
    float wash = mix(q, q + 1.0 / steps, smoothstep(0.35, 0.65, frac));

    // 背光的一面积墨，向光的一面留给纸。
    // density 是这块东西的「最浓能有多浓」，不是给所有档统一打折——
    // 那样算出来满屏都是淡到看不见的灰
    float depth_of_ink = pow(1.0 - wash, 0.75) * density;
    // 受光面也要留一点底墨，否则物体整个化进纸里，剪影就没了
    depth_of_ink = max(depth_of_ink, density * 0.46);

    // 轮廓积墨：视线越掠过表面，墨越重
    float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), edge_width);
    depth_of_ink += rim * edge_ink;

    // 宣纸的纤维 + 墨的洇痕。
    //
    // 三向投影：单用 xz 平面取样，墙面和屋顶这种竖着的面会被拉成一道道竖条纹。
    // 按法线把三个平面的取样混起来，哪个面朝哪边都不糊。
    vec3 an = abs(n);
    an /= max(an.x + an.y + an.z, 0.0001);
    vec2 uv_x = world_pos.zy * grain_scale;
    vec2 uv_y = world_pos.xz * grain_scale;
    vec2 uv_z = world_pos.xy * grain_scale;
    float fiber = texture(grain, uv_x).r * an.x
                + texture(grain, uv_y).r * an.y
                + texture(grain, uv_z).r * an.z;

    // 大尺度的洇痕：同一张噪声放大几倍再取一次，墨就不是一块死板的平涂，
    // 而是有浓有淡地化开。水墨和「灰色卡通渲染」的差别有一半在这儿
    float blot = texture(grain, uv_x * 0.22 + vec2(3.7, 1.9)).r * an.x
               + texture(grain, uv_y * 0.22 + vec2(3.7, 1.9)).r * an.y
               + texture(grain, uv_z * 0.22 + vec2(3.7, 1.9)).r * an.z;

    // 纹理只作用在有墨的地方。淡处要留干净的纸——
    // 不分浓淡一律加噪声的话，白墙上会长出一片霉斑
    float mottle = mix(1.0 - grain_amount, 1.0 + grain_amount, fiber) * mix(0.86, 1.14, blot);
    depth_of_ink *= mix(1.0, mottle, clamp(depth_of_ink * 1.7, 0.0, 1.0));

    // 地面的格子：只让它影响墨的浓淡，不另染一种颜色
    if (tile_amount > 0.0) {
        depth_of_ink *= mix(1.0, texture(tile_tex, UV).r * 1.6, tile_amount);
    }

    // 远则无墨
    float far = smoothstep(fade_start, fade_end, eye);
    depth_of_ink *= 1.0 - far;

    depth_of_ink = clamp(depth_of_ink - flash * 0.8, 0.0, 1.0);

    vec3 c = mix(paper.rgb, ink.rgb, depth_of_ink);
    // 浅绛设色：只在有墨的地方染一点色，纸白处不染
    c = mix(c, c * tint.rgb * 2.0, color_amount * depth_of_ink);

    ALBEDO = c;
}
";

        static Shader shader;
        static Texture2D grain;
        static ZxPalette current = ZxPalette.Of("village");

        static Shader Get()
        {
            return shader ??= new Shader { Code = Code };
        }

        /// <summary>
        /// 换图时把当前这张纸定下来。之后建的材质都用它。
        ///
        /// 做成静态的，是因为一次只有一张图——和 Zx3D.Tile 一个道理。
        /// 否则每个造材质的地方都得把调色板传下去，人物那一层根本拿不到。
        /// </summary>
        public static void Use(ZxPalette pal)
        {
            current = pal;
        }

        /// <summary>
        /// 宣纸纹理：运行时用噪声生成，不打包任何贴图文件。
        /// 全工程共用一张——纸就一张，没必要每个物体一份。
        /// </summary>
        public static Texture2D Grain()
        {
            if (grain != null) return grain;
            var noise = new FastNoiseLite
            {
                NoiseType = FastNoiseLite.NoiseTypeEnum.SimplexSmooth,
                Frequency = 0.035f,
                FractalOctaves = 4,
                FractalGain = 0.55f,
            };
            grain = new NoiseTexture2D
            {
                Noise = noise,
                Width = 256,
                Height = 256,
                Seamless = true,
                Normalize = true,
            };
            return grain;
        }

        /// <summary>
        /// 一块墨色材质。
        ///
        /// color 是数据里那份彩色（门派色、怪物色、生态色）。它不直接当颜色用，
        /// 而是拆成两半：亮度决定这块东西「墨有多浓」——深色的怪画得重，浅色的画得淡；
        /// 色相留一点点当设色。这样 55 种怪不改一行代码就各有各的墨色。
        /// </summary>
        public static ShaderMaterial Mat(Color color, float density = -1f, float colorAmount = 0.18f)
        {
            var m = new ShaderMaterial { Shader = Get() };
            m.SetShaderParameter("paper", current.Paper);
            m.SetShaderParameter("ink", current.Ink);
            m.SetShaderParameter("tint", color);
            // 没指定就按固有色的明度反推：越深的东西墨越浓。
            // 数据里那份彩色就是这么变成墨色的——55 种怪一行代码不用改
            m.SetShaderParameter("density", density >= 0 ? density : Mathf.Clamp(1.2f - Luma(color) * 0.7f, 0.58f, 1f));
            m.SetShaderParameter("color_amount", colorAmount);
            m.SetShaderParameter("grain", Grain());
            return m;
        }

        /// <summary>贴到镜头跟前就抖掉。树冠、屋顶这些长在视线上的东西要它</summary>
        public static ShaderMaterial FadeNear(ShaderMaterial m, float distance = 1.9f)
        {
            m.SetShaderParameter("near_fade", distance);
            return m;
        }

        /// <summary>地面：极淡的墨，格子由一张「一格一像素」的图决定浓淡</summary>
        public static ShaderMaterial GroundMat(Texture2D tiles)
        {
            var m = Mat(current.Accent, 0.16f, 0.5f);
            m.SetShaderParameter("tile_tex", tiles);
            m.SetShaderParameter("tile_amount", 0.2f);
            return m;
        }

        static float Luma(Color c)
        {
            return 0.299f * c.R + 0.587f * c.G + 0.114f * c.B;
        }
    }
}
