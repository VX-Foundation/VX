import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  batch,
  effect,
  flushScheduler,
  scheduleTask,
  state
} from '../../packages/runtime/dist/client.js';
import { renderElement } from '../../packages/runtime/dist/server.js';

const tasks = 50_000;
let completed = 0;
const schedulerStart = performance.now();
for (let index = 0; index < tasks; index += 1) {
  scheduleTask(() => { completed += 1; }, { priority: index % 10 === 0 ? 'user-blocking' : 'normal' });
}
flushScheduler();
const schedulerMs = performance.now() - schedulerStart;
assert.equal(completed, tasks);
assert.ok(schedulerMs < 5_000, `Phase 15 scheduler regression: ${schedulerMs.toFixed(2)} ms.`);

const signal = state(0);
let observed = 0;
const subscription = effect(() => { observed = signal.value; });
const writes = 100_000;
const reactiveStart = performance.now();
batch(() => {
  for (let index = 1; index <= writes; index += 1) signal.value = index;
});
flushScheduler();
const reactiveMs = performance.now() - reactiveStart;
assert.equal(observed, writes);
assert.ok(reactiveMs < 2_500, `Phase 15 reactive batching regression: ${reactiveMs.toFixed(2)} ms.`);
subscription.dispose();

const elements = 25_000;
const ssrStart = performance.now();
let bytes = 0;
for (let index = 0; index < elements; index += 1) {
  bytes += renderElement('div', { id: `item-${index}`, style: { zIndex: index % 10, opacity: 1 }, 'data-index': index }, String(index)).length;
}
const ssrMs = performance.now() - ssrStart;
assert.ok(bytes > 1_000_000);
assert.ok(ssrMs < 5_000, `Phase 15 deterministic SSR regression: ${ssrMs.toFixed(2)} ms.`);

console.log(JSON.stringify({
  tasks,
  schedulerMs: Number(schedulerMs.toFixed(2)),
  writes,
  reactiveMs: Number(reactiveMs.toFixed(2)),
  elements,
  ssrMs: Number(ssrMs.toFixed(2)),
  bytes
}));
console.log('Phase 15 runtime benchmark passed.');
