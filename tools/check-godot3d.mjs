/**
 * 验 3D 渲染层：场景搭得起来吗、跑起来会不会崩、画出来是什么样。
 *
 *   node tools/check-godot3d.mjs                        无头跑 180 帧，出一份自检报告
 *   node tools/check-godot3d.mjs --map=dixue --level=22  换张图、换个等级再验
 *   node tools/check-godot3d.mjs --shot=out.png          开窗口跑，截一张图存下来
 *
 * 无头模式下 Godot 不出画面，但节点照建、逻辑照跑——所以它能验
 * 「地形/人物/怪物都建出来了、连跑一百多帧没崩」，验不了「好不好看」。
 * 好不好看只能靠 --shot 截图自己看。
 */
import path from 'node:path';
import { findGodot, build, run, verdict, INSTALL_HINT } from './godot-run.mjs';

const DEFAULT_FRAMES = 600;

const passthrough = [];
let shot = null;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--shot=')) shot = path.resolve(arg.slice('--shot='.length));
  else passthrough.push(arg);
}

const godot = findGodot();
if (!godot) {
  console.log(INSTALL_HINT);
  process.exit(0);
}

console.log('Godot: ' + godot.version);
if (!build()) process.exit(1);

// 截图必须开窗口：无头模式下渲染器是空的，抓下来是一张黑图
const userArgs = shot
  ? ['--shot=' + shot.split(path.sep).join('/'), ...passthrough]
  : ['--check=' + DEFAULT_FRAMES, ...passthrough];

const output = run(godot, {
  frames: DEFAULT_FRAMES * 4,
  headless: !shot,
  userArgs,
});
console.log(output.trim());

if (shot) {
  const ok = /截图已保存/.test(output);
  console.log(ok ? '\n✓ 画面截下来了：' + shot : '\n✗ 没截到图');
  process.exit(ok ? 0 : 1);
}
process.exit(verdict(output, '3D 渲染自检'));
