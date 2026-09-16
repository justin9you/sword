/**
 * 在 Godot 里跑一遍冒烟测试，不开编辑器。
 *
 *   node tools/smoke-godot.mjs
 *
 * 验的是整条链路：Godot 起得来吗 → JSON 读得进来吗 → 逻辑层跑得动吗。
 * verify:godot 只能证明编译得过，证明不了 Godot 的 API 真像我们以为的那样
 * （桩是照着记忆写的），所以这条才是"真在引擎里跑"的那个。
 *
 * 跑的是 smoke.tscn，不是主场景——主场景现在是 3D 游戏本体，它不会自己停。
 * 画面那边另有一条 check:godot3d。
 *
 * 找不到 Godot 就直接说清楚该装什么，然后以 0 退出：
 * 没装引擎不算测试失败，只是这条检查跑不了。
 */
import { findGodot, build, run, verdict, INSTALL_HINT } from './godot-run.mjs';

/** 场景跑完会自己停；这个上限只是兜底，防止哪天卡住把 CI 挂死 */
const MAX_FRAMES = 300;

const godot = findGodot();
if (!godot) {
  console.log(INSTALL_HINT);
  process.exit(0);
}

console.log('Godot: ' + godot.version);
if (!build()) process.exit(1);

const output = run(godot, { scene: 'res://smoke.tscn', frames: MAX_FRAMES });
console.log(output.trim());
process.exit(verdict(output, 'Godot 冒烟测试'));
