// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  acquireComponentContext,
  applyForwardedBindings,
  assignComponentRef,
  componentModel,
  createComponentHandle,
  createComponentScope,
  createOutputDispatcher,
  disposeComponentScope,
  mountComponentScope,
  onComponentScopeMount,
  provideComponentContext
} from '../src/component.js';

describe('Phase 11 component model', () => {
  it('supports controlled and uncontrolled models', () => {
    const emit = vi.fn();
    const uncontrolled = componentModel({}, 'value', () => 'initial', emit, 'change');
    uncontrolled.value = 'next';
    expect(uncontrolled.value).toBe('next');
    expect(emit).toHaveBeenCalledWith('change', 'next');

    const controlled = componentModel({ value: 'external' }, 'value', () => 'fallback', emit, 'change');
    controlled.value = 'requested';
    expect(controlled.value).toBe('external');
  });

  it('inherits context and publishes refs only through explicit assignment', () => {
    const parent = createComponentScope();
    provideComponentContext(parent, 'theme', 'dark');
    const child = createComponentScope(parent);
    const lease = acquireComponentContext<string>(child, 'theme', undefined, true);
    expect(lease.value.value).toBe('dark');

    const host = document.createElement('div');
    const start = document.createComment('start');
    const button = document.createElement('button');
    const end = document.createComment('end');
    host.append(start, button, end);
    const handle = createComponentHandle(start, end);
    const ref = { current: null as typeof handle | null };
    const clear = assignComponentRef(ref, handle);
    expect(ref.current?.firstElement()).toBe(button);
    clear();
    expect(ref.current).toBeNull();

    lease.release();
    disposeComponentScope(child);
    disposeComponentScope(parent);
  });

  it('queues mounts and blocks dangerous forwarding surfaces', () => {
    const scope = createComponentScope();
    const mounted = vi.fn();
    onComponentScopeMount(scope, mounted);
    expect(mounted).not.toHaveBeenCalled();
    mountComponentScope(scope);
    expect(mounted).toHaveBeenCalledOnce();

    const node = document.createElement('div');
    const cleanup = applyForwardedBindings(node, {
      attributes: { dataTestId: 'field' },
      className: 'field active',
      style: { opacity: 0.5 }
    });
    expect(node.getAttribute('data-testid')).toBe('field');
    expect(node.classList.contains('field')).toBe(true);
    expect(node.style.opacity).toBe('0.5');
    cleanup();
    expect(node.classList.contains('field')).toBe(false);
    expect(() => applyForwardedBindings(node, { attributes: { innerHTML: '<b>unsafe</b>' } })).toThrow();
    expect(() => applyForwardedBindings(node, { attributes: { onclick: 'unsafe()' } })).toThrow();
  });

  it('rejects undeclared outputs', () => {
    const dispatch = createOutputDispatcher({}, ['change']);
    expect(() => dispatch('unknown')).toThrow();
  });
});
