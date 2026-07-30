// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApplicationRouter } from '../src/runtime/client.js';
import type { RuntimeRouteRecord, VXRouteComponentModule } from '../src/types.js';

function module(label: string): VXRouteComponentModule {
  return {
    createComponent() {
      const node = document.createDocumentFragment();
      const main = document.createElement('main');
      main.tabIndex = -1;
      main.textContent = label;
      node.appendChild(main);
      return { node, ctx: {}, dispose() { main.remove(); } };
    }
  };
}

function route(id: string, path: string, label: string, load = async () => module(label)): RuntimeRouteRecord {
  const segment = path === '/' ? [] : [{ kind: 'static' as const, value: path.slice(1) }];
  return {
    id, path, segments: segment, parameters: [], pagePath: `/src/pages/${id}.vx`, layoutPaths: [], boundaries: {},
    policy: { render: 'client', preload: 'none', hydration: 'islands', streaming: 'blocking', generation: { mode: 'dynamic', entries: [] }, metadata: { title: label }, preserve: { state: false, scroll: true, focus: true } },
    queries: [], actions: [], score: segment.length * 100, loadPage: load, loadLayouts: []
  };
}

describe('application router', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    history.replaceState({}, '', '/');
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  it('mounts routes and updates metadata through client navigation', async () => {
    const root = document.getElementById('app')!;
    const router = createApplicationRouter({ root, routes: [route('about', '/about', 'About'), route('root', '/', 'Home')] });
    await router.start();
    expect(root.textContent).toBe('Home');
    await router.navigate('/about');
    expect(root.textContent).toBe('About');
    expect(document.title).toBe('About');
    expect(router.current?.id).toBe('about');
    router.dispose();
  });

  it('cancels stale navigations before they replace the active route', async () => {
    let release!: () => void;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    const slowRoute = route('slow', '/slow', 'Slow', async () => { await slow; return module('Slow'); });
    const fastRoute = route('fast', '/fast', 'Fast');
    const root = document.getElementById('app')!;
    const router = createApplicationRouter({ root, routes: [slowRoute, fastRoute, route('root', '/', 'Home')] });
    await router.start();
    const first = router.navigate('/slow');
    const second = router.navigate('/fast');
    release();
    await Promise.all([first, second]);
    expect(root.textContent).toBe('Fast');
    router.dispose();
  });
});
