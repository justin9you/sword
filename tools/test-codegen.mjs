/**
 * C# 代码生成器的自测。
 *
 *   node tools/test-codegen.mjs
 *
 * 这里测的全是「出错时该不该响」，而不是正常路径——正常路径每次 npm run export:data
 * 都在跑，坏了立刻就知道。真正会悄悄坏掉的是那几条保护：类型打架、类名撞车。
 * 它们平时不响，等哪天数据里真出现了才该响，所以得专门拿假数据喂一遍确认它们还活着。
 */
import { inferSchema, emitDataFile } from './csharp-codegen.mjs';

let passed = 0;
const failures = [];

function ok(cond, name, detail) {
  if (cond) passed++;
  else failures.push(name + (detail ? '\n      ' + detail : ''));
}

/** 把一组记录生成成 C#，只取代码文本 */
function emit(records, name) {
  return emitDataFile([{ root: inferSchema(records, name), wrapper: null }], '');
}

function throws(fn, name) {
  try {
    fn();
    ok(false, name, '本该抛错，却顺利跑完了');
  } catch (e) {
    ok(true, name);
  }
}

// ── 该响的保护 ────────────────────────────────────────────────

throws(() => emit([{ v: 1 }, { v: 'x' }], 'T'), '同一字段一会儿数字一会儿字符串 → 抛错');
throws(() => emit([{ v: [1] }, { v: { a: 1 } }], 'T'), '同一字段一会儿数组一会儿对象 → 抛错');

throws(
  () =>
    emitDataFile(
      [
        { root: inferSchema([{ box: { x: 1 } }], 'Zx'), wrapper: null },
        { root: inferSchema([{ box: { y: 'hi' } }], 'Zx'), wrapper: null },
      ],
      ''
    ),
  '两棵树推出同名但不同形的嵌套类 → 抛错'
);

// ── 该正确推断的类型 ──────────────────────────────────────────

ok(/public double p;/.test(emit([{ p: 1 }, { p: 1.5 }], 'T')), '整数混小数 → double（不能截断成 int）');
ok(!/public float /.test(emit([{ p: 1.5 }], 'T')), '小数不生成 float（float 会改变数值，和 JS 的双精度对不上）');
ok(/public int n;/.test(emit([{ n: 1 }, { n: 2 }], 'T')), '全是整数 → int');

const kw = emit([{ class: 'a', ref: 1 }], 'T');
ok(/public string @class;/.test(kw) && /public int @ref;/.test(kw), 'C# 关键字字段名加 @ 前缀');

ok(/public string\[\] tags;/.test(emit([{ tags: [] }, { tags: ['a'] }], 'T')), '空数组 + 有内容的数组 → string[]');
ok(/public string\[\] tags;/.test(emit([{ tags: [] }], 'T')), '全是空数组 → 退成 string[]，不崩');

ok(/public class ZxMapBlock/.test(emit([{ blocks: [{ x: 1 }] }], 'ZxMap')), '数组元素类名去掉复数：blocks → ZxMapBlock');
ok(/public class ZxItemStats/.test(emit([{ stats: { atk: 1 } }], 'ZxItem')), '对象字段类名保持原样：stats → ZxItemStats');

// ── 结果 ──────────────────────────────────────────────────────

console.log('\n  C# 代码生成器');
if (failures.length) {
  console.log('    ✗ ' + failures.length + ' 项不通过');
  for (const f of failures) console.log('      · ' + f);
  console.log('\n✗ ' + passed + ' 项通过，' + failures.length + ' 项失败\n');
  process.exit(1);
}
console.log('    ✓ 全部通过');
console.log('\n✓ 全部 ' + passed + ' 项通过\n');
