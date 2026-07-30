import assert from 'node:assert/strict';

import { installFakeDom } from './test-support/fake-dom.mjs';

installFakeDom();

const {
  collectionMount,
  effect,
  markViewSource,
  state,
  structuralMount
} = await import('../packages/runtime/dist/client.js');

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

// A retained structural key updates branch bindings without remounting its DOM.
{
  const parent = document.createElement('div');
  const anchor = document.createComment('if');
  parent.appendChild(anchor);
  const selection = state({ key: 'ready', values: { label: 'First' } });
  let mountCount = 0;
  let mountedInput;

  const dispose = structuralMount(
    anchor,
    () => selection.value,
    (_selected, scope) => {
      mountCount += 1;
      const input = document.createElement('input');
      markViewSource(input, 'branch-input');
      const binding = scope.binding('label');
      const subscription = effect(() => {
        input.value = String(binding.value ?? '');
      });
      mountedInput = input;
      return { node: input, cleanup: () => subscription.dispose() };
    },
    () => 'fade'
  );

  const original = mountedInput;
  assert.equal(original.value, 'First');
  selection.value = { key: 'ready', values: { label: 'Second' } };
  await flush();
  assert.equal(mountCount, 1);
  assert.equal(mountedInput, original);
  assert.equal(original.value, 'Second');

  selection.value = { key: 'other', values: { label: 'Replacement' } };
  await flush();
  assert.equal(mountCount, 2);
  assert.notEqual(mountedInput, original);
  assert.equal(mountedInput.value, 'Replacement');
  dispose();
}

// Returning to the active key cancels a stale exit transition instead of leaving the retained DOM hidden.
{
  const parent = document.createElement('div');
  const anchor = document.createComment('transition');
  parent.appendChild(anchor);
  const selection = state({ key: 'a' });
  let mountCount = 0;
  let retained;
  let exitCancelled = false;

  const dispose = structuralMount(
    anchor,
    () => selection.value,
    () => {
      mountCount += 1;
      const element = document.createElement('div');
      element.animate = (frames) => {
        const exiting = frames[0]?.opacity === 1;
        let resolve;
        const finished = exiting
          ? new Promise((done) => { resolve = done; })
          : Promise.resolve();
        return {
          finished,
          cancel() {
            if (exiting) exitCancelled = true;
            resolve?.();
          }
        };
      };
      retained = element;
      return element;
    },
    () => 'fade'
  );

  const original = retained;
  selection.value = { key: 'b' };
  await flush();
  assert.equal(parent.childNodes[1], original);
  selection.value = { key: 'a' };
  await flush();
  assert.equal(exitCancelled, true);
  assert.equal(mountCount, 1);
  assert.equal(parent.childNodes[1], original);
  dispose();
}

// Keyed reconciliation moves existing elements and preserves focus/selection.
{
  const parent = document.createElement('div');
  const anchor = document.createComment('collection');
  parent.appendChild(anchor);
  const items = state([
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' }
  ]);
  const created = new Map();
  let keyCalls = 0;

  const dispose = collectionMount(
    anchor,
    () => items.value,
    (item) => {
      keyCalls += 1;
      return item.id;
    },
    (item, index) => {
      const input = document.createElement('input');
      markViewSource(input, 'collection-input');
      const subscription = effect(() => {
        input.value = `${item.value.label}:${index.value}`;
      });
      created.set(item.value.id, input);
      return { node: input, cleanup: () => subscription.dispose() };
    }
  );

  assert.equal(keyCalls, 2);
  const alpha = created.get('a');
  const beta = created.get('b');
  beta.focus();
  beta.setSelectionRange(1, 3, 'forward');

  items.value = [
    { id: 'b', label: 'Beta updated' },
    { id: 'a', label: 'Alpha updated' }
  ];
  await flush();

  assert.equal(created.size, 2);
  assert.equal(keyCalls, 4);
  assert.equal(parent.childNodes[1], beta);
  assert.equal(parent.childNodes[2], alpha);
  assert.equal(beta.value, 'Beta updated:0');
  assert.equal(alpha.value, 'Alpha updated:1');
  assert.equal(document.activeElement, beta);
  assert.equal(beta.selectionStart, 1);
  assert.equal(beta.selectionEnd, 3);
  assert.equal(beta.selectionDirection, 'forward');
  assert.equal(beta.dataset.vxCollectionKey, 'b');
  assert.equal(alpha.dataset.vxCollectionKey, 'a');
  dispose();
}

// Managed resource states select loading, error, and empty fallbacks directly.
{
  const parent = document.createElement('div');
  const anchor = document.createComment('resource');
  parent.appendChild(anchor);
  const resource = state({ status: 'loading', data: [] });

  const fallback = (text) => {
    const element = document.createElement('span');
    element.textContent = text;
    return element;
  };

  const dispose = collectionMount(
    anchor,
    () => resource.value,
    (item) => item.id,
    () => fallback('item'),
    {
      loading: () => fallback('loading'),
      empty: () => fallback('empty'),
      error: (problem) => {
        const element = document.createElement('span');
        const subscription = effect(() => {
          const value = problem.value;
          element.textContent = value instanceof Error ? value.message : String(value ?? 'error');
        });
        return { node: element, cleanup: () => subscription.dispose() };
      }
    }
  );

  assert.equal(parent.textContent, 'loading');
  resource.value = { status: 'error', data: [], error: new Error('failed') };
  await flush();
  assert.equal(parent.textContent, 'failed');
  resource.value = { status: 'ready', data: [] };
  await flush();
  assert.equal(parent.textContent, 'empty');
  dispose();
}

console.log('VX Phase 5 runtime verification passed (branch identity, stale-transition cancellation, keyed DOM movement, reactive bindings, focus/selection preservation, and loading/error/empty fallbacks).');
