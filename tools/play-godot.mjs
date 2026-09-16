/**
 * 直接把 3D 版开起来玩，不用打开编辑器。
 *
 *   node tools/play-godot.mjs                  从草庙村 1 级开始
 *   node tools/play-godot.mjs --map=dixue --level=22   想看哪张图就去哪张
 *
 * 参数原样转给场景（见 ZxGame3D.ReadArgs）：--map、--level、--sect。
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findGodot, build, PROJECT, INSTALL_HINT } from './godot-run.mjs';

const godot = findGodot();
if (!godot) {
  console.log(INSTALL_HINT);
  process.exit(0);
}

console.log('Godot: ' + godot.version);
if (!build()) process.exit(1);

const extra = process.argv.slice(2);
const argv = ['--path', PROJECT];
if (extra.length) argv.push('--', ...extra);

const r = spawnSync(godot.cmd, argv, {
  stdio: 'inherit',
  shell: godot.cmd.indexOf(path.sep) < 0,
});
process.exit(r.status ?? 0);
