// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { state } from '../src/state.js';
import { setText, setAttribute, on, conditionalMount, collectionMount, listMount, selectPatternBranch } from '../src/dom.js';

describe('DOM Primitives', () => {

  it('updates text content correctly', () => {
    const el = document.createElement('div');
    
    setText(el, 'Hello');
    expect(el.textContent).toBe('Hello');

    setText(el, 42);
    expect(el.textContent).toBe('42');
    
    // Test that it doesn't do unnecessary DOM updates
    let setterCalled = false;
    Object.defineProperty(el, 'textContent', {
      get() { return '42'; },
      set(_v) { setterCalled = true; }
    });
    
    setText(el, 42);
    expect(setterCalled).toBe(false); // Should not have called setter
  });

  it('updates attributes correctly', () => {
    const el = document.createElement('div');

    setAttribute(el, 'id', 'my-id');
    expect(el.getAttribute('id')).toBe('my-id');

    setAttribute(el, 'disabled', true);
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.getAttribute('disabled')).toBe('');

    setAttribute(el, 'disabled', false);
    expect(el.hasAttribute('disabled')).toBe(false);

    setAttribute(el, 'class', null);
    expect(el.hasAttribute('class')).toBe(false);
  });

  it('binds events correctly', () => {
    const el = document.createElement('button');
    const handler = vi.fn();

    on(el, 'click', handler);

    el.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

});

describe('conditionalMount', () => {

  it('mounts a fragment when condition becomes truthy', async () => {
    const container = document.createElement('div');
    const anchor = document.createComment('if');
    container.appendChild(anchor);

    const visible = state(false);

    conditionalMount(
      anchor,
      () => visible.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'Visible';
        const frag = document.createDocumentFragment();
        frag.appendChild(span);
        return frag;
      }
    );

    // Initial state: nothing mounted
    expect(container.querySelector('span')).toBeNull();

    // Trigger the condition and wait for the microtask flush
    visible.value = true;
    await Promise.resolve();

    expect(container.querySelector('span')).not.toBeNull();
    expect(container.querySelector('span')!.textContent).toBe('Visible');
  });

  it('unmounts the fragment when condition becomes falsy', async () => {
    const container = document.createElement('div');
    const anchor = document.createComment('if');
    container.appendChild(anchor);

    const visible = state(true);

    conditionalMount(
      anchor,
      () => visible.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'Visible';
        const frag = document.createDocumentFragment();
        frag.appendChild(span);
        return frag;
      }
    );

    // Initially mounted (effect runs synchronously on first call)
    expect(container.querySelector('span')).not.toBeNull();

    // Condition goes false — wait for microtask flush, then it should unmount
    visible.value = false;
    await Promise.resolve();

    expect(container.querySelector('span')).toBeNull();
  });

});

describe('listMount', () => {

  it('renders an initial list of items', () => {
    const container = document.createElement('div');
    const anchor = document.createComment('list');
    container.appendChild(anchor);

    const items = state([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);

    listMount(
      anchor,
      () => items.value,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.value.name;
        const frag = document.createDocumentFragment();
        frag.appendChild(li);
        return frag;
      }
    );

    const nodes = container.querySelectorAll('li');
    expect(nodes.length).toBe(2);
    expect(nodes[0]!.textContent).toBe('A');
    expect(nodes[1]!.textContent).toBe('B');
  });

  it('removes items that are no longer in the collection', async () => {
    const container = document.createElement('div');
    const anchor = document.createComment('list');
    container.appendChild(anchor);

    const items = state([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);

    listMount(
      anchor,
      () => items.value,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.value.name;
        const frag = document.createDocumentFragment();
        frag.appendChild(li);
        return frag;
      }
    );

    // Remove item 2 and wait for the microtask flush
    items.value = [{ id: 1, name: 'A' }];
    await Promise.resolve();

    const nodes = container.querySelectorAll('li');
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.textContent).toBe('A');
  });

});




describe('Phase 5 structural identity', () => {
  it('preserves a truthy branch while its reactive value changes', async () => {
    const container = document.createElement('div');
    const anchor = document.createComment('if');
    container.appendChild(anchor);
    const value = state({ visible: true, label: 'A' });
    let renders = 0;

    conditionalMount(
      anchor,
      () => value.value.visible ? value.value : null,
      () => {
        renders += 1;
        const input = document.createElement('input');
        input.dataset['vxSource'] = 'stable-input';
        return input;
      }
    );

    const input = container.querySelector('input');
    value.value = { visible: true, label: 'B' };
    await Promise.resolve();

    expect(container.querySelector('input')).toBe(input);
    expect(renders).toBe(1);
  });

  it('moves keyed DOM nodes directly and preserves focus and selection', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const anchor = document.createComment('collection');
    container.appendChild(anchor);
    const items = state([{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]);

    collectionMount(
      anchor,
      () => items.value,
      (item) => item.id,
      (item) => {
        const input = document.createElement('input');
        input.dataset['vxSource'] = 'name-input';
        input.value = item.value.name;
        return input;
      }
    );

    const original = container.querySelectorAll('input')[1]!;
    original.focus();
    original.setSelectionRange(1, 2);
    items.value = [{ id: 2, name: 'Two updated' }, { id: 1, name: 'One' }];
    await Promise.resolve();

    const reordered = container.querySelectorAll('input')[0]!;
    expect(reordered).toBe(original);
    expect(document.activeElement).toBe(original);
    expect(original.selectionStart).toBe(1);
    expect(original.selectionEnd).toBe(2);
    container.remove();
  });

  it('selects literal, named binding, and fallback patterns', () => {
    expect(selectPatternBranch('ready', [{ category: 'literal', text: '"ready"', literal: 'ready' }])?.key).toBe(0);
    expect(selectPatternBranch(
      { status: 'success', data: 42 },
      [{ category: 'named', text: 'Success(value)', name: 'Success', binding: 'value' }]
    )?.values?.['value']).toBe(42);
    expect(selectPatternBranch('other', [], 9)?.key).toBe(9);
  });

  it('renders loading, empty, and error collection branches', async () => {
    const container = document.createElement('div');
    const anchor = document.createComment('collection');
    container.appendChild(anchor);
    const resource = state<{ status: string; data?: unknown[]; error?: Error }>({ status: 'loading' });

    collectionMount(
      anchor,
      () => resource.value,
      (_item, index) => index,
      () => document.createElement('span'),
      {
        loading: () => document.createTextNode('Loading'),
        empty: () => document.createTextNode('Empty'),
        error: (error) => document.createTextNode((error.value as Error).message)
      }
    );

    expect(container.textContent).toBe('Loading');
    resource.value = { status: 'success', data: [] };
    await Promise.resolve();
    expect(container.textContent).toBe('Empty');
    resource.value = { status: 'error', error: new Error('Failed') };
    await Promise.resolve();
    expect(container.textContent).toBe('Failed');
  });
});
