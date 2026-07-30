// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mountRouteModules, preloadRouteData } from '../src/runtime/module.js';
import type { RuntimeRouteRecord, VXRouteComponentModule } from '../src/types.js';

function pageModule(label: string): VXRouteComponentModule {
  return {
    createComponent() {
      const node = document.createDocumentFragment();
      const main = document.createElement('main');
      main.textContent = label;
      node.appendChild(main);
      return { node, ctx: {}, dispose() { main.remove(); } };
    }
  };
}

function layoutModule(): VXRouteComponentModule {
  return {
    createComponent(_props, _runtime, _outputs, content = {}) {
      const node = document.createDocumentFragment();
      const header = document.createElement('header');
      header.textContent = 'Layout';
      node.appendChild(header);
      const provider = content['route'];
      const child = typeof provider === 'function' ? provider() as { node: Node; cleanup(): void } : undefined;
      if (child) node.appendChild(child.node);
      return { node, ctx: {}, dispose() { child?.cleanup(); header.remove(); } };
    }
  };
}

const route: RuntimeRouteRecord = {
  id: 'root', path: '/', segments: [], parameters: [], pagePath: '/src/pages/index.vx',
  layoutPaths: ['/src/pages/_layout.vx'], boundaries: {},
  policy: { render: 'client', preload: 'intent', hydration: 'islands', streaming: 'blocking', generation: { mode: 'dynamic', entries: [] }, metadata: {}, preserve: { state: false, scroll: true, focus: true } },
  queries: [], actions: [], score: 0,
  loadPage: async () => pageModule('Page'),
  loadLayouts: [async () => layoutModule()]
};

describe('route module runtime', () => {
  it('composes nested layouts without wrapper nodes', () => {
    const root = document.createElement('div');
    const page = pageModule('Page');
    const layout = layoutModule();
    const mounted = mountRouteModules(root, route, {
      page,
      layouts: [layout],
      byPath: new Map([['/src/pages/index.vx', page], ['/src/pages/_layout.vx', layout]])
    }, {});
    expect(root.innerHTML).toBe('<header>Layout</header><main>Page</main>');
    mounted.dispose();
    expect(root.textContent).toBe('');
  });

  it('disposes the already-created branch when layout creation fails', () => {
    let disposed = 0;
    const page: VXRouteComponentModule = {
      createComponent() {
        const node = document.createDocumentFragment();
        return { node, ctx: {}, dispose() { disposed += 1; } };
      }
    };
    const failingLayout: VXRouteComponentModule = {
      createComponent() { throw new Error('layout failed'); }
    };
    const root = document.createElement('div');
    expect(() => mountRouteModules(root, route, {
      page,
      layouts: [failingLayout],
      byPath: new Map([['/src/pages/index.vx', page], ['/src/pages/_layout.vx', failingLayout]])
    }, {})).toThrow('layout failed');
    expect(disposed).toBe(1);
  });

  it('preloads declared route queries and disposes setup ownership', async () => {
    let refetched = 0;
    let disposed = 0;
    const module: VXRouteComponentModule = {
      setup: () => ({
        profile: { refetch: async () => { refetched += 1; } },
        __vxCleanup: [() => { disposed += 1; }]
      })
    };
    const dataRoute: RuntimeRouteRecord = {
      ...route,
      layoutPaths: [], loadLayouts: [],
      queries: [{ name: 'profile', side: 'universal', modulePath: '/src/pages/index.vx' }]
    };
    await preloadRouteData(dataRoute, { page: module, layouts: [], byPath: new Map([['/src/pages/index.vx', module]]) }, {}, {});
    expect(refetched).toBe(1);
    expect(disposed).toBe(1);
  });
});
