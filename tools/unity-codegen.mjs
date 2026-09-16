/**
 * 从导出的数据反推 C# 数据类。
 *
 * 为什么要自动生成而不是手写：数据表还在长（加物品、加图、加技能都会带新字段），
 * 手写的 C# 类一旦落后，Unity 的 JsonUtility 不会报错——它只会把读不到的字段留成
 * 默认值 0，然后你在游戏里追一个"为什么这把剑没有暴击"的鬼。字段表跟着数据走，
 * 这类错就不会发生。
 *
 * 类型推断规则：
 *   整数（全部记录都是整数）→ int      有小数 → double
 *   true/false → bool       字符串 → string
 *   数组 → T[]（元素类型同样递归推断）
 *   对象 → 嵌套类，类名 = 父类名 + 字段名（数组字段去掉复数 s）
 *
 * 小数一律用 double 而不是 Unity 更常见的 float：这些数值的真身是 JS 里的双精度，
 * 存成 float 会在写入的那一刻就变样（9.4f 其实是 9.400000095…），等级一乘、取整一落，
 * 算出来的气血就和网页版差 1。差 1 看不出来，但它是真的不一样。
 *
 * 同一个字段在不同记录里类型打架（比如一半是数字一半是字符串）会直接抛错——
 * 这种数据本身就是错的，不该悄悄糊过去。
 */

/** C# 关键字：撞上了要加 @ 前缀 */
const KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked',
  'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else',
  'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for',
  'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock',
  'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params',
  'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short',
  'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'virtual',
  'void', 'volatile', 'while',
]);

function pascal(name) {
  return name.replace(/(^|[_-])([a-z])/g, (_, __, c) => c.toUpperCase());
}

/** blocks → Block，stats → Stats（ss 结尾的不动） */
function singular(name) {
  if (/ss$/.test(name)) return name;
  return name.replace(/s$/, '');
}

function fieldName(name) {
  return KEYWORDS.has(name) ? '@' + name : name;
}

/** 两个字段类型合并；不兼容就抛 */
function mergeType(a, b, where) {
  if (!a) return b;
  if (!b) return a;
  if (a.kind === b.kind) {
    if (a.kind === 'array') return { kind: 'array', elem: mergeType(a.elem, b.elem, where + '[]') };
    if (a.kind === 'class') {
      const fields = new Map(a.fields);
      for (const [k, v] of b.fields) fields.set(k, mergeType(fields.get(k), v, where + '.' + k));
      return { kind: 'class', name: a.name, fields };
    }
    return a;
  }
  // 整数和小数混着出现，按小数算——反过来会把小数截断
  if ((a.kind === 'int' && b.kind === 'float') || (a.kind === 'float' && b.kind === 'int')) {
    return { kind: 'float' };
  }
  // 空数组推不出元素类型，让有内容的那边说了算
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;
  throw new Error('字段 ' + where + ' 的类型前后不一致：' + a.kind + ' vs ' + b.kind);
}

/** 一个值 → 类型描述 */
function typeOf(value, className, path) {
  if (value === null || value === undefined) return { kind: 'unknown' };
  if (typeof value === 'boolean') return { kind: 'bool' };
  if (typeof value === 'string') return { kind: 'string' };
  if (typeof value === 'number') return { kind: Number.isInteger(value) ? 'int' : 'float' };
  if (Array.isArray(value)) {
    // 类名在字段那一层就已经单数化过了（blocks → ZxMapBlock），这里直接沿用
    let elem = { kind: 'unknown' };
    for (const v of value) elem = mergeType(elem, typeOf(v, className, path + '[]'), path + '[]');
    return { kind: 'array', elem };
  }
  const fields = new Map();
  for (const k of Object.keys(value)) {
    // 数组字段的类名指的是「一个元素」，去掉复数：blocks → ZxMapBlock；
    // 对象字段是整体，保持原样：stats → ZxItemStats
    const child = className + pascal(Array.isArray(value[k]) ? singular(k) : k);
    fields.set(k, typeOf(value[k], child, path + '.' + k));
  }
  return { kind: 'class', name: className, fields };
}

/**
 * 一组同构记录 → 类型树。
 * @param records 记录数组（config 这种单对象也包成 [obj] 传进来）
 * @param rootName 根类名，如 ZxItem
 */
export function inferSchema(records, rootName) {
  let type = { kind: 'class', name: rootName, fields: new Map() };
  for (const rec of records) {
    type = mergeType(type, typeOf(rec, rootName, rootName), rootName);
  }
  return type;
}

/** 类型 → C# 类型名；顺便把遇到的嵌套类塞进 collected */
function csType(t, collected) {
  switch (t.kind) {
    case 'int': return 'int';
    case 'float': return 'double';
    case 'bool': return 'bool';
    case 'string': return 'string';
    case 'unknown': return 'string'; // 全是 null/空数组，没别的信息可用
    case 'array': return csType(t.elem, collected) + '[]';
    case 'class': {
      collect(t, collected);
      return t.name;
    }
    default: throw new Error('未知类型 ' + t.kind);
  }
}

/** 类的签名：字段名 + 类型，用来判断两个同名类是不是真的同一个 */
function signature(type) {
  return [...type.fields.entries()]
    .map(([k, t]) => k + ':' + (t.kind === 'class' ? t.name : t.kind === 'array' ? 'array' : t.kind))
    .sort()
    .join(',');
}

function collect(type, collected) {
  const prev = collected.get(type.name);

  // 同名类必须同形，否则生成出来的代码会互相覆盖。
  // 字段名和类型都要比：只比名字的话，一个 int 一个 string 会悄悄按先来的那个生成。
  if (prev && signature(prev) !== signature(type)) {
    throw new Error(
      '类名冲突：' + type.name + ' 有两套不同的字段\n' +
      '  已有：' + signature(prev) + '\n' +
      '  又来：' + signature(type)
    );
  }
  if (!prev) collected.set(type.name, type);

  // 见过了也要继续往下走：两个同名类的签名一致，冲突可能藏在更深一层——
  // 比如两边都有个叫 box 的字段、都指向 ZxBox，但两个 ZxBox 里装的东西不一样。
  for (const t of type.fields.values()) {
    if (t.kind === 'class') collect(t, collected);
    else if (t.kind === 'array' && t.elem.kind === 'class') collect(t.elem, collected);
  }
}

function emitClass(type, collected) {
  const lines = ['  [Serializable]', '  public class ' + type.name, '  {'];
  for (const [name, t] of type.fields) {
    lines.push('    public ' + csType(t, collected) + ' ' + fieldName(name) + ';');
  }
  lines.push('  }');
  return lines.join('\n');
}

/**
 * 生成 ZxData.cs 的全文。
 * @param specs [{ root: 类型树, wrapper: {cls, field} | null }]
 */
export function emitDataFile(specs, header) {
  const collected = new Map();
  const bodies = [];

  for (const spec of specs) {
    collect(spec.root, collected);
    if (spec.wrapper) {
      bodies.push(
        [
          '  [Serializable]',
          '  public class ' + spec.wrapper.cls,
          '  {',
          '    public ' + spec.root.name + '[] ' + spec.wrapper.field + ';',
          '  }',
        ].join('\n')
      );
    }
  }

  const classes = [...collected.values()].map((t) => emitClass(t, collected));

  return [
    header,
    'using System;',
    '',
    'namespace Zhuxian.Data',
    '{',
    classes.concat(bodies).join('\n\n'),
    '}',
    '',
  ].join('\n');
}
