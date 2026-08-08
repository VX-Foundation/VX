import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { parse } from '../../packages/language/dist/index.js';
import { deserializeServerValue, serializeServerValue } from '../../packages/runtime/dist/server-platform/serialization.js';
import { parseRequestBody } from '../../packages/server/dist/body.js';
import { createDeterministicRandom, runFuzzCampaign } from '../../packages/security-testing/dist/index.js';

const iterations = Number(process.env.VX_FUZZ_ITERATIONS ?? 1_000);
const seed = Number(process.env.VX_FUZZ_SEED ?? 20);
const artifactRoot = resolve(import.meta.dirname, '../../artifacts/fuzz');

const parser = await runFuzzCampaign({
  seed,
  iterations,
  maximumBytes: 16_384,
  corpus: [
    '#view\n  View {}\n#end view\n',
    '#script\nstate count = 0\n#end script\n'
  ],
  target(input) {
    parse(new TextDecoder().decode(input), '/fuzz/input.vx');
  }
});
persistCrashes('parser', parser);
assert.equal(parser.crashes.length, 0, describeCrash('parser', parser));

const random = createDeterministicRandom(seed + 1);
const serializer = await runFuzzCampaign({
  seed: seed + 1,
  iterations,
  maximumBytes: 8_192,
  corpus: ['value'],
  target() {
    const value = generatedValue(random, 0);
    const encoded = serializeServerValue(value, {
      maxDepth: 20,
      maxNodes: 5_000,
      maxSourceBytes: 256_000,
      maxStringBytes: 64_000
    });
    deserializeServerValue(encoded);
  }
});
persistCrashes('serializer', serializer);
assert.equal(serializer.crashes.length, 0, describeCrash('serializer', serializer));

const payloads = [
  '{"version":1,"value":null}',
  '{',
  '{"version":2}',
  '{"version":1,"value":{"__proto__":1}}'
];
const malformed = await runFuzzCampaign({
  seed: seed + 2,
  iterations,
  maximumBytes: 32_768,
  corpus: payloads,
  target(input) {
    deserializeServerValue(new TextDecoder().decode(input), {
      maxDepth: 20,
      maxNodes: 5_000,
      maxSourceBytes: 32_768,
      maxStringBytes: 16_384
    });
  },
  expectedError(error) {
    return error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError;
  }
});
persistCrashes('serializer-payload', malformed);
assert.equal(malformed.crashes.length, 0, describeCrash('serializer-payload', malformed));

const http = await runFuzzCampaign({
  seed: seed + 3,
  iterations,
  maximumBytes: 32_768,
  corpus: ['{}', 'a=b', 'text'],
  async target(input, signal) {
    const types = ['application/json', 'application/problem+json', 'application/x-www-form-urlencoded', 'text/plain', 'application/octet-stream', 'multipart/form-data; boundary=vx-fuzz'];
    const methods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    const type = types[(input[0] ?? 0) % types.length] ?? 'application/octet-stream';
    const method = methods[(input[1] ?? 0) % methods.length] ?? 'POST';
    const controller = new AbortController();
    const relay = () => controller.abort(signal.reason);
    signal.addEventListener('abort', relay, { once: true });
    if ((input[2] ?? 0) % 17 === 0) controller.abort(new DOMException('Fuzz cancellation.', 'AbortError'));
    const declaredLength = (input[3] ?? 0) % 13 === 0 ? String(65_536) : String(input.byteLength);
    try {
      const request = new Request('https://vx.test/fuzz?case=' + (input[4] ?? 0), {
        method,
        headers: { 'content-type': type, 'content-length': declaredLength, 'x-vx-fuzz': String(seed) },
        body: input,
        signal: controller.signal
      });
      await parseRequestBody(request, { maxBytes: 32_768, maxFields: 128, maxDepth: 20 });
    } finally { signal.removeEventListener('abort', relay); }
  },
  expectedError(error) {
    return error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError || (error instanceof DOMException && error.name === 'AbortError');
  }
});
persistCrashes('http', http);
assert.equal(http.crashes.length, 0, describeCrash('http', http));

console.log(JSON.stringify({
  seed,
  iterations,
  parser: summary(parser),
  serializer: summary(serializer),
  malformed: summary(malformed),
  http: summary(http)
}));
console.log('Phase 20 parser, serializer, and HTTP fuzzing passed.');

function generatedValue(random, depth) {
  if (depth > 4) return random.pick([null, true, false, random.integer(-1_000, 1_000), `text-${random.integer(0, 1_000)}`]);
  const kind = random.integer(0, 8);
  if (kind === 0) return null;
  if (kind === 1) return random.boolean();
  if (kind === 2) return random.integer(-100_000, 100_000);
  if (kind === 3) return `value-${random.integer(0, 100_000)}`;
  if (kind === 4) return BigInt(random.integer(-1_000, 1_000));
  if (kind === 5) return new Date(random.integer(0, 2_000_000_000) * 1_000);
  if (kind === 6) return Array.from({ length: random.integer(0, 8) }, () => generatedValue(random, depth + 1));
  if (kind === 7) {
    const value = {};
    for (let index = 0; index < random.integer(0, 8); index += 1) value[`key${index}`] = generatedValue(random, depth + 1);
    return value;
  }
  return new Set(Array.from({ length: random.integer(0, 5) }, () => random.integer(0, 100)));
}

function describeCrash(name, report) {
  return `${name} fuzz crash: ${JSON.stringify(report.crashes[0]?.error)} seed=${report.seed}`;
}
function summary(report) {
  return {
    executions: report.executions,
    corpusSize: report.corpusSize,
    durationMs: Number(report.durationMs.toFixed(2))
  };
}


function persistCrashes(target, report) {
  if (report.crashes.length === 0) return;
  mkdirSync(artifactRoot, { recursive: true });
  for (const crash of report.crashes) {
    const prefix = `${target}-seed-${report.seed}-iteration-${crash.iteration}`.replaceAll(/[^A-Za-z0-9_.-]/gu, '-');
    writeFileSync(resolve(artifactRoot, `${prefix}.input.bin`), crash.input);
    writeFileSync(resolve(artifactRoot, `${prefix}.minimized.bin`), crash.minimizedInput);
    writeFileSync(resolve(artifactRoot, `${prefix}.json`), `${JSON.stringify({
      schema: 'https://vx.veelv.site/schemas/fuzz-crash/v1',
      target, seed: report.seed, iteration: crash.iteration, error: crash.error,
      runtime: { node: process.version, platform: platform(), release: release(), architecture: arch() },
      commit: gitCommit(), timestamp: new Date().toISOString(),
      originalFile: `${prefix}.input.bin`, minimizedFile: `${prefix}.minimized.bin`
    }, null, 2)}\n`);
  }
}
function gitCommit() { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(import.meta.dirname, '../..'), encoding: 'utf8' }).trim(); } catch { return 'unavailable'; } }
