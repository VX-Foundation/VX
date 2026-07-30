import assert from 'node:assert/strict';
import { parse } from '../../packages/language/dist/index.js';
import { analyze, lower } from '../../packages/compiler/dist/core.js';
import { deserializeServerValue, serializeServerValue } from '../../packages/runtime/dist/server.js';

const seed = Number(process.env.VX_FUZZ_SEED ?? '1337');
const iterations = Number(process.env.VX_FUZZ_ITERATIONS ?? '750');
const random = mulberry32(seed);
const corpus = [
  '', '#view\n  Text("ok")\n#end view\n', '#script\n  state count: Int = 0\n#end script\n#view\n  Button("Add", onClick: count = count + 1)\n#end view\n',
  '#view\n  Image(source: "x", alt: "x")\n#end view\n', '#style\n.foo { color: red; }\n#end style\n'
];

for (let index = 0; index < iterations; index += 1) {
  const source = mutate(corpus[index % corpus.length] ?? '', random);
  let parsed;
  assert.doesNotThrow(() => { parsed = parse(source, `/fuzz/${seed}-${index}.vx`); });
  assert.ok(parsed?.ast);
  assert.ok(Array.isArray(parsed?.diagnostics));
  assertSpans(parsed.ast, source.length);
  const result = analyze(parsed.ast);
  assert.ok(Array.isArray(result.diagnostics));
  if (![...parsed.diagnostics, ...result.diagnostics].some((item) => item.severity === 'error')) {
    try { lower(parsed.ast, result.graph, result.visual, result.data); }
    catch (error) {
      assert.equal(error?.name, 'UnsupportedLoweringError', `Unexpected lowering failure: ${error}`);
    }
  }
}

for (let index = 0; index < Math.min(iterations, 400); index += 1) {
  const value = randomValue(random, 0);
  const encoded = serializeServerValue(value);
  const decoded = deserializeServerValue(encoded);
  assertEquivalent(decoded, value);
}

console.log(`Phase 9 fuzz verification passed (${iterations} compiler cases, seed ${seed}).`);

function mutate(source, random) {
  const alphabet = '#@{}[]():,\.\n abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\"\'/*+-!?';
  let output = source;
  const operations = 1 + Math.floor(random() * 12);
  for (let step = 0; step < operations; step += 1) {
    const position = Math.floor(random() * (output.length + 1));
    const mode = Math.floor(random() * 3);
    if (mode === 0 || output.length === 0) output = output.slice(0, position) + alphabet[Math.floor(random() * alphabet.length)] + output.slice(position);
    else if (mode === 1) output = output.slice(0, position) + output.slice(position + 1);
    else output = output.slice(0, position) + alphabet[Math.floor(random() * alphabet.length)] + output.slice(position + 1);
  }
  return output.slice(0, 8192);
}

function assertSpans(value, sourceLength, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if ('span' in value && value.span && typeof value.span === 'object') {
    const { start, end } = value.span;
    assert.ok(Number.isInteger(start?.offset) && Number.isInteger(end?.offset));
    assert.ok(start.offset >= 0 && end.offset >= start.offset);
    assert.ok(end.offset <= sourceLength + 1);
  }
  for (const child of Object.values(value)) assertSpans(child, sourceLength, seen);
}

function randomValue(random, depth) {
  if (depth > 3) return Math.floor(random() * 1000);
  switch (Math.floor(random() * 9)) {
    case 0: return null;
    case 1: return random() > 0.5;
    case 2: return Math.floor(random() * 100000) - 50000;
    case 3: return `value-${Math.floor(random() * 10000)}`;
    case 4: return BigInt(Math.floor(random() * 100000));
    case 5: return new Date(Math.floor(random() * 1_700_000_000_000));
    case 6: return Array.from({ length: Math.floor(random() * 5) }, () => randomValue(random, depth + 1));
    case 7: return new Map([[`key-${depth}`, randomValue(random, depth + 1)]]);
    default: return { [`field${depth}`]: randomValue(random, depth + 1) };
  }
}

function mulberry32(initial) {
  let state = initial >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function assertEquivalent(actual, expected) {
  if (expected instanceof Date) { assert.ok(actual instanceof Date); assert.equal(actual.toISOString(), expected.toISOString()); return; }
  if (expected instanceof Map) { assert.ok(actual instanceof Map); assert.equal(actual.size, expected.size); for (const [key, value] of expected) assertEquivalent(actual.get(key), value); return; }
  if (expected instanceof Set) { assert.ok(actual instanceof Set); assert.deepEqual([...actual], [...expected]); return; }
  if (Array.isArray(expected)) { assert.ok(Array.isArray(actual)); assert.equal(actual.length, expected.length); expected.forEach((value, index) => assertEquivalent(actual[index], value)); return; }
  if (expected && typeof expected === 'object') { assert.ok(actual && typeof actual === 'object'); const keys = Object.keys(expected); assert.deepEqual(Object.keys(actual), keys); for (const key of keys) assertEquivalent(actual[key], expected[key]); return; }
  assert.equal(actual, expected);
}
