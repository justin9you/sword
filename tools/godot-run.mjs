/**
 * 找到本机的 Godot，并按指定场景把工程跑起来。
 *
 * smoke-godot.mjs 和 check-godot3d.mjs 共用这一份——两边都要「找引擎、
 * 先编译、再跑某个场景、按输出判结论」，重复两遍迟早会不一致。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT = path.join(ROOT, 'godot');

const CSPROJ = path.join(PROJECT, 'Zhuxian3D.csproj');

export const INSTALL_HINT =
  '· 没找到 Godot，跳过这条检查。\n' +
  '  要跑的话装这两样（都不用注册账号）：\n' +
  '    winget install GodotEngine.GodotEngine.Mono   Godot 4.x 的 .NET 版\n' +
  '    winget install Microsoft.DotNet.SDK.8         Godot 4.2+ 的 C# 工程要它';

export function findGodot() {
  // 1. PATH 里的别名（winget 装的会加 godot / godot_console）
  for (const name of ['godot_console', 'godot']) {
    const hit = spawnSync(name, ['--version'], { encoding: 'utf8', shell: true });
    if (hit.status === 0 && hit.stdout.trim()) return { cmd: name, version: hit.stdout.trim() };
  }

  // 2. winget 的包目录
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

/**
 * 先编译再跑。
 *
 * 命令行启动的 Godot 不会自己编 C#，它直接加载上一次编出来的程序集——
 * 少了这一步，改完代码跑出来的还是旧的，而且看不出任何异常。
 */
export function build() {
  const r = spawnSync('dotnet', ['build', CSPROJ, '--nologo', '-v', 'q'], { encoding: 'utf8' });
  if (r.status === 0) return true;
  console.error((r.stdout || '') + (r.stderr || ''));
  console.error('✗ C# 工程没编过，先修编译错误');
  return false;
}

/**
 * 跑一个场景，返回合并后的输出。
 *
 * scene 为空就跑 project.godot 里的主场景；headless 关掉的话会真开窗口
 * （截图必须开窗口，无头模式下画面是空的）。
 */
export function run(godot, { scene, frames = 600, headless = true, userArgs = [] }) {
  const argv = [];
  if (headless) argv.push('--headless');
  argv.push('--path', PROJECT, '--quit-after', String(frames));
  if (scene) argv.push(scene);
  if (userArgs.length) argv.push('--', ...userArgs);

  const r = spawnSync(godot.cmd, argv, {
    encoding: 'utf8',
    shell: godot.cmd.indexOf(path.sep) < 0,
  });
  return (r.stdout || '') + (r.stderr || '');
}

/**
 * 判结论。
 *
 * Godot 自己的退出码不可靠（脚本里报了错它也可能正常退），所以只认
 * 场景脚本打出来的那份报告。
 */
export function verdict(output, label) {
  if (/✗/.test(output) || !/全部 \d+ 项通过/.test(output)) {
    console.error('\n✗ ' + label + '没过');
    return 1;
  }
  console.log('\n✓ ' + label + '通过');
  return 0;
}
