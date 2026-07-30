import { describe, expect, it } from 'vitest';
import { generateApplicationModules } from '../src/build/codegen.js';
import type { ApplicationGraph } from '../src/types.js';

const graph: ApplicationGraph = {
  version: 1,
  rootDir: '/project',
  pagesDir: '/project/src/pages',
  diagnostics: [],
  endpoints: [],
  routes: [{
    id: 'root', path: '/', segments: [], parameters: [], pagePath: '/project/src/pages/index.vx',
    layoutPaths: ['/project/src/pages/_layout.vx'], boundaries: {},
    policy: { render: 'client', preload: 'intent', hydration: 'islands', streaming: 'blocking', generation: { mode: 'dynamic', entries: [] }, metadata: {}, preserve: { state: false, scroll: true, focus: true } },
    queries: [], actions: [], score: 0
  }]
};

describe('application module generation', () => {
  it('emits route-level dynamic imports and a portable manifest', () => {
    const modules = generateApplicationModules(graph);
    expect(modules.client).toContain('createApplicationRouter');
    expect(modules.client).toContain('export default async function mountVXApplication');
    expect(modules.client).toContain('import("/src/pages/index.vx")');
    expect(modules.client).toContain('import("/src/pages/_layout.vx")');
    expect(JSON.parse(modules.manifest).routes[0].pagePath).toBe('src/pages/index.vx');
  });
});
