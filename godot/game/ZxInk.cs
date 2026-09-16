// 墨线：全屏后处理，沿深度和法线的断层描一道边。
//
// 网页版的画风是「矢量色块 + 墨线勾边」。3D 这边要接上同一个风格，
// 靠的不是给每个模型手工配一圈壳（盒子的法线是分面的，套壳会在棱角处裂开），
// 而是在最后一步整屏找边：相邻像素的深度差得多、或者法线拐得急，就是一条轮廓。
//
// 挂在相机底下的一张全屏片，顶点阶段直接把它按到近平面铺满屏幕。

using Godot;

namespace Zhuxian.Godot
{
    public static class ZxInk
    {
        const string Code = @"
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, depth_test_disabled, fog_disabled;

uniform sampler2D depth_tex : hint_depth_texture, repeat_disable, filter_nearest;
uniform sampler2D normal_tex : hint_normal_roughness_texture, repeat_disable, filter_nearest;

uniform vec4 ink : source_color = vec4(0.04, 0.04, 0.06, 1.0);
uniform float thickness = 2.1;
uniform float depth_edge = 0.045;
uniform float normal_edge = 0.24;
// 远处不描边：几十米外每个像素都是断层，全描出来就成了一团毛线
uniform float fade_start = 34.0;
uniform float fade_end = 80.0;

void vertex() {
    POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

float view_z(vec2 uv, mat4 inv_proj) {
    float d = texture(depth_tex, uv).r;
    vec4 view = inv_proj * vec4(vec3(uv * 2.0 - 1.0, d), 1.0);
    return -(view.z / view.w);
}

void fragment() {
    vec2 texel = vec2(thickness) / VIEWPORT_SIZE;

    float c = view_z(SCREEN_UV, INV_PROJECTION_MATRIX);
    // 天空的深度是 0，换算出来是个极大值。不钳住的话地平线会被判成一整条断层
    if (c > 4000.0) discard;

    float l = view_z(SCREEN_UV - vec2(texel.x, 0.0), INV_PROJECTION_MATRIX);
    float r = view_z(SCREEN_UV + vec2(texel.x, 0.0), INV_PROJECTION_MATRIX);
    float u = view_z(SCREEN_UV - vec2(0.0, texel.y), INV_PROJECTION_MATRIX);
    float d = view_z(SCREEN_UV + vec2(0.0, texel.y), INV_PROJECTION_MATRIX);

    float gap = max(max(abs(c - l), abs(c - r)), max(abs(c - u), abs(c - d)));
    // 阈值随距离放大：同样的斜面，远处每像素跨过的深度本来就更多
    float hit_depth = step(depth_edge * max(1.0, c * 0.5), gap);

    vec3 nc = texture(normal_tex, SCREEN_UV).xyz * 2.0 - 1.0;
    vec3 nl = texture(normal_tex, SCREEN_UV - vec2(texel.x, 0.0)).xyz * 2.0 - 1.0;
    vec3 nr = texture(normal_tex, SCREEN_UV + vec2(texel.x, 0.0)).xyz * 2.0 - 1.0;
    vec3 nu = texture(normal_tex, SCREEN_UV - vec2(0.0, texel.y)).xyz * 2.0 - 1.0;
    vec3 nd = texture(normal_tex, SCREEN_UV + vec2(0.0, texel.y)).xyz * 2.0 - 1.0;
    float bend = 1.0 - min(min(dot(nc, nl), dot(nc, nr)), min(dot(nc, nu), dot(nc, nd)));
    float hit_normal = step(normal_edge, bend);

    float edge = max(hit_depth, hit_normal) * (1.0 - smoothstep(fade_start, fade_end, c));
    if (edge < 0.04) discard;

    ALBEDO = ink.rgb;
    ALPHA = edge;
}
";

        static ShaderMaterial live;

        /// <summary>换图时把墨色换掉：松烟墨偏蓝，油烟墨偏褐，跟着生态走</summary>
        public static void UseInk(Color ink)
        {
            live?.SetShaderParameter("ink", ink);
        }

        /// <summary>挂到相机上。片本身不参与剔除，所以要把裁剪余量放大</summary>
        public static MeshInstance3D Build(Color ink)
        {
            var mat = new ShaderMaterial { Shader = new Shader { Code = Code } };
            mat.SetShaderParameter("ink", ink);
            live = mat;

            return new MeshInstance3D
            {
                Name = "Ink",
                Mesh = new QuadMesh { Size = new Vector2(2, 2) },
                MaterialOverride = mat,
                ExtraCullMargin = 16384f,
                CastShadow = GeometryInstance3D.ShadowCastingSetting.Off,
                Position = new Vector3(0, 0, -1),
            };
        }
    }
}
