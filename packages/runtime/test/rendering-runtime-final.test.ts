// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  DOM_NAMESPACES,
  attachShadowRoot,
  batch,
  createCleanupStack,
  createDOMElement,
  createHydrationRegistry,
  createResourceOwner,
  defineCustomElement,
  disposeCleanupStack,
  effect,
  flushScheduler,
  inspectRuntimeLeaks,
  scheduleTask,
  setDOMAttributeNS,
  setDOMStyles,
  startTransition,
  state,
  transitionElement
} from '../src/client.js';
import { createRequestRuntime, createServerRenderContext, renderDocument, renderElement, renderResumableBoundary } from '../src/server.js';

describe('Phase 15 scheduler and ownership', () => {
  it('runs work by priority and cancels scheduled tasks', async () => {
    const order: string[] = [];
    scheduleTask(() => { order.push('idle'); }, { priority: 'idle' });
    scheduleTask(() => { order.push('transition'); }, { priority: 'transition' });
    scheduleTask(() => { order.push('immediate'); }, { priority: 'immediate' });
    const cancelled = scheduleTask(() => { order.push('cancelled'); }, { priority: 'normal' });
    cancelled.cancel();
    flushScheduler();
    await cancelled.finished;
    expect(order).toEqual(['immediate', 'transition', 'idle']);
    expect(cancelled.state).toBe('cancelled');
  });

  it('batches reactive writes and inherits transition priority', () => {
    const value = state(0);
    let observed = -1;
    const subscription = effect(() => { observed = value.value; });
    startTransition(() => batch(() => { value.value = 1; value.value = 2; }));
    flushScheduler();
    expect(observed).toBe(2);
    expect(subscription.priority).toBe('normal');
    subscription.dispose();
  });

  it('disposes cleanup stacks in reverse order and reports active ownership', () => {
    const order: number[] = [];
    const stack = createCleanupStack('phase15-stack');
    stack.push(() => order.push(1), () => order.push(2));
    expect(inspectRuntimeLeaks().some((leak) => leak.ownerLabel === 'phase15-stack')).toBe(true);
    disposeCleanupStack(stack);
    expect(order).toEqual([2, 1]);
    expect(inspectRuntimeLeaks().some((leak) => leak.ownerLabel === 'phase15-stack')).toBe(false);

    const owner = createResourceOwner('manual-owner');
    const cleanup = vi.fn();
    owner.own(cleanup, 'listener');
    owner.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe('Phase 15 DOM and transitions', () => {
  it('creates SVG and MathML elements with namespace inheritance', () => {
    const svg = createDOMElement('svg');
    const circle = createDOMElement('circle', { parent: svg });
    const math = createDOMElement('math');
    expect(svg.namespaceURI).toBe(DOM_NAMESPACES.svg);
    expect(circle.namespaceURI).toBe(DOM_NAMESPACES.svg);
    expect(math.namespaceURI).toBe(DOM_NAMESPACES.mathml);
    setDOMAttributeNS(circle, 'xlink:href', '#shape');
    expect(circle.getAttributeNS(DOM_NAMESPACES.xlink, 'href')).toBe('#shape');
  });

  it('restores styles and supports shadow/custom-element contracts', () => {
    const element = document.createElement('div');
    element.style.setProperty('opacity', '0.5');
    const restore = setDOMStyles(element, { opacity: 1, backgroundColor: 'black' });
    expect(element.style.opacity).toBe('1');
    restore();
    expect(element.style.opacity).toBe('0.5');
    expect(element.style.backgroundColor).toBe('');

    expect(attachShadowRoot(element).mode).toBe('open');
    class PhaseElement extends HTMLElement {}
    defineCustomElement('vx-phase-element', PhaseElement);
    expect(customElements.get('vx-phase-element')).toBe(PhaseElement);
  });

  it('interrupts and reverses element transitions', async () => {
    const element = document.createElement('div');
    let reversed = 0;
    let cancelled = 0;
    let resolve!: () => void;
    const finished = new Promise<void>((done) => { resolve = done; });
    element.animate = vi.fn(() => ({
      finished,
      cancel() { cancelled += 1; resolve(); },
      reverse() { reversed += 1; }
    } as unknown as Animation));
    const exiting = transitionElement(element, 'exit', 'fade');
    const entering = transitionElement(element, 'enter', 'fade');
    expect(entering).toBe(exiting);
    expect(reversed).toBe(1);
    entering.cancel();
    await entering.finished;
    expect(cancelled).toBe(1);
  });
});

describe('Phase 15 hydration and SSR', () => {
  it('emits deterministic markup and resumable state', () => {
    const runtime = createRequestRuntime({ requestId: 'phase15', routeId: 'home' });
    const context = createServerRenderContext({ runtime, routeId: 'home', requestURL: new URL('https://vx.test/'), hydration: 'full', nonce: 'strict-csp' });
    const html = renderElement('div', { z: 1, style: { zIndex: 2, color: 'red' }, a: 2 }, 'content', 'source');
    expect(html).toBe('<div a="2" data-vx-source="source" style="color:red;z-index:2" z="1">content</div>');
    const boundary = renderResumableBoundary(context, 'counter', { count: 7 }, html);
    expect(boundary).toContain('vx:resume:vxr-home-0:start');
    const documentResult = renderDocument({ context, html: boundary, clientEntry: '/client.js' });
    expect(documentResult.html).toContain('"resumable"');
    expect(documentResult.html).toContain('nonce="strict-csp"');
    runtime.dispose();
  });

  it('reports hydration tag mismatches', () => {
    const root = document.createElement('main');
    const existing = document.createElement('span');
    existing.setAttribute('data-vx-source', 'title');
    root.appendChild(existing);
    const diagnostics: string[] = [];
    const registry = createHydrationRegistry(root, { onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code) });
    expect(registry.claimElement('title', 'h1')).toBeUndefined();
    expect(diagnostics).toContain('VX_HYDRATION_TAG_MISMATCH');
    registry.dispose();
  });
});
