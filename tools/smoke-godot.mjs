/**
 * 在 Godot 里跑一遍冒烟测试，不开编辑器。
 *
 *   node tools/smoke-godot.mjs
 *
 * 验的是整条链路：Godot 起得来吗 → JSON 读得进来吗 → 逻辑层跑得动吗。
 * 这是唯一一个"真在引擎里跑"的检查——verify:godot 只能证明编译得过，
 * 证明不了 Godot 的 API 真像我们以为的那样（桩是照着记忆写的）。
 *
 * 找不到 Godot 就直接说清楚该装什么，然后以 0 退出：
 * 没装引擎不算测试失败，只是这条检查跑不了。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.join(ROOT, 'godot');

/** 场景跑完会自己停；这个上限只是兜底，防止哪天卡住把 CI 挂死 */
const MAX_FRAMES = 300;

function findGodot() {
  // 1. PATH 里的别名（winget 装的会加 godot / godot_console）
  for (const name of ['godot_console', 'godot']) {
    const hit = spawnSync(name, ['--version'], { encoding: 'utf8', shell: true });
    if (hit.status === 0 && hit.stdout.trim()) return { cmd: name, version: hit.stdout.trim() };
  }

  // 2. winget 的包目录，按版本号倒序挑最新的
  const pkgRoot = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(pkgRoot)) {
    for (const dir of fs.readdirSync(pkgRoot).filter((d) => /godot/i.test(d))) {
      const stack = [path.join(pkgRoot, dir)];
      while (stack.length) {
        const cur = stack.pop();
        for (const name of fs.readdirSync(cur)) {
          const full = path.join(cur, name);
          if (fs.statSync(full).isDirectory()) stack.push(full);
          else if (/^Godot.*console\.exe$/i.test(name)) {
            const v = spawnSync(full, ['--version'], { encoding: 'utf8' });
            return { cmd: full, version: (v.stdout || '').trim() };
          }
        }
      }
    }
  }

  return null;
}

const godot = findGodot();
if (!godot) {
  console.log(
    '· 没找到 Godot，跳过这条检查。\n' +
    '  要跑的话装这两样（都不用注册账号）：\n' +
    '    winget install GodotEngine.GodotEngine.Mono   Godot 4.x 的 .NET 版\n' +
    '    winget install Microsoft.DotNet.SDK.8         Godot 4.2+ 的 C# 工程要它'
  );
  process.exit(0);
}

console.log('Godot: ' + godot.version);

const run = spawnSync(
  godot.cmd,
  ['--headless', '--path', PROJECT, '--quit-after', String(MAX_FRAMES)],
  { encoding: 'utf8', shell: godot.cmd.indexOf(path.sep) < 0 }
);

const output = (run.stdout || '') + (run.stderr || '');
console.log(output.trim());

// Godot 自己的退出码不可靠（脚本里报了错它也可能正常退），所以认冒烟脚本的结论
if (/✗/.test(output) || !/全部 \d+ 项通过/.test(output)) {
  console.error('\n✗ Godot 冒烟测试没过');
  process.exit(1);
}
console.log('\n✓ Godot 冒烟测试通过');
