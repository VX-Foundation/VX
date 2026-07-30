import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createForm, decodeFormData, schema } from '../../packages/forms/dist/index.js';

const profile = schema.object({
  name: schema.string().min(2).max(100),
  email: schema.email(),
  age: schema.integer().min(13).max(130),
  tags: schema.array(schema.string()).min(1).max(10),
  address: schema.object({ city: schema.string().min(2), country: schema.string().min(2) })
});
const valid = { name: 'Ada Lovelace', email: 'ada@example.com', age: 36, tags: ['compiler', 'forms'], address: { city: 'London', country: 'UK' } };
for (let index = 0; index < 1_000; index += 1) profile.parse(valid);

const validationStart = performance.now();
for (let index = 0; index < 25_000; index += 1) assert.equal(profile.parse(valid).success, true);
const validationMs = performance.now() - validationStart;

const controller = createForm({ schema: profile, initialValues: valid, validateOn: ['submit'] });
const controllerStart = performance.now();
for (let index = 0; index < 10_000; index += 1) {
  controller.setValue('name', index % 2 === 0 ? 'Ada' : 'Grace');
  controller.setValue('age', 20 + (index % 80));
}
const controllerMs = performance.now() - controllerStart;

const decodeStart = performance.now();
for (let index = 0; index < 10_000; index += 1) {
  const input = new URLSearchParams([['profile.name', 'Ada'], ['tags', 'compiler'], ['tags', 'forms'], ['age', '36']]);
  const decoded = decodeFormData(input);
  assert.equal(decoded.profile.name, 'Ada');
}
const decodeMs = performance.now() - decodeStart;

const limits = { validationMs: 2_000, controllerMs: 1_200, decodeMs: 1_500 };
assert(validationMs <= limits.validationMs, `Schema validation regression: ${validationMs.toFixed(2)} ms > ${limits.validationMs} ms.`);
assert(controllerMs <= limits.controllerMs, `Form controller regression: ${controllerMs.toFixed(2)} ms > ${limits.controllerMs} ms.`);
assert(decodeMs <= limits.decodeMs, `Form decoding regression: ${decodeMs.toFixed(2)} ms > ${limits.decodeMs} ms.`);
console.log(`Phase 12 forms benchmark passed: 25,000 validations in ${validationMs.toFixed(2)} ms, 20,000 field updates in ${controllerMs.toFixed(2)} ms, 10,000 decodes in ${decodeMs.toFixed(2)} ms.`);
