import { describe, expect, it } from 'vitest';
import { fs as memfs } from 'memfs';
import { buildApplicationGraph, scanRoutes } from '../src/build/scanner.js';

function write(filePath: string, source: string): void {
  const directory = filePath.slice(0, filePath.lastIndexOf('/'));
  memfs.mkdirSync(directory, { recursive: true });
  memfs.writeFileSync(filePath, source);
}

const PAGE = `#view
  View {
    Text("Page")
  }
#end view`;

const LAYOUT = `#script
  content route: required
#end script
#view
  View {
    Content(route)
  }
#end view`;

describe('application graph scanner', () => {
  it('discovers pages, layouts, boundaries, endpoints, policies, and typed data contracts', () => {
    memfs.rmSync('/app', { recursive: true, force: true });
    write('/app/src/pages/_layout.vx', LAYOUT);
    write('/app/src/pages/_error.vx', PAGE);
    write('/app/src/pages/_loading.vx', PAGE);
    write('/app/src/pages/_not-found.vx', PAGE);
    write('/app/src/pages/index.vx', PAGE);
    write('/app/src/pages/users/new.vx', PAGE);
    write('/app/src/pages/users/[id.integer].vx', `#script
  prop id: Int
  query user from User.load { id: id }
  action save() {
    return
  }
#end script
#view
  Text("User")
#end view`);
    write('/app/src/pages/users/[id.integer].route.json', JSON.stringify({
      render: 'server',
      preload: 'visible',
      metadata: { title: 'User' },
      preserve: { state: true }
    }));
    write('/app/src/pages/api/users.endpoint.ts', 'export async function GET() {}\nexport const POST = async () => {};');

    const graph = buildApplicationGraph({ dir: '/app/src/pages', rootDir: '/app', fsModule: memfs });

    expect(graph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(graph.routes.map((route) => route.path)).toContain('/users/:id');
    const user = graph.routes.find((route) => route.path === '/users/:id')!;
    expect(user.parameters).toEqual([
      expect.objectContaining({ name: 'id', kind: 'integer', catchAll: false })
    ]);
    expect(user.layoutPaths).toEqual(['/app/src/pages/_layout.vx']);
    expect(user.boundaries).toEqual({
      loading: '/app/src/pages/_loading.vx',
      error: '/app/src/pages/_error.vx',
      notFound: '/app/src/pages/_not-found.vx'
    });
    expect(user.policy).toEqual(expect.objectContaining({ render: 'server', preload: 'visible' }));
    expect(user.queries.map((query) => query.name)).toEqual(['user']);
    expect(user.actions.map((action) => action.name)).toEqual(['save']);
    expect(graph.endpoints[0]).toEqual(expect.objectContaining({ path: '/api/users', methods: ['GET', 'POST'] }));
  });

  it('reports missing and incompatible parameter props', () => {
    memfs.rmSync('/invalid', { recursive: true, force: true });
    write('/invalid/src/pages/[id.integer].vx', `#script
  prop id: String
#end script
#view
  Text(id)
#end view`);
    const graph = buildApplicationGraph({ dir: '/invalid/src/pages', rootDir: '/invalid', fsModule: memfs });
    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toContain('VX_ROUTE_PARAMETER_PROP_TYPE');
  });

  it('detects endpoint shapes and route action collisions', () => {
    memfs.rmSync('/contract-conflict', { recursive: true, force: true });
    write('/contract-conflict/src/pages/_layout.vx', `#script
  content route: required
  action save() {
    return
  }
#end script
#view
  Content(route)
#end view`);
    write('/contract-conflict/src/pages/[id].vx', `#script
  prop id: String
  action save() {
    return
  }
#end script
#view
  Text(id)
#end view`);
    write('/contract-conflict/src/pages/api/[id].endpoint.ts', 'export async function GET() {}');
    write('/contract-conflict/src/pages/api/[name].endpoint.ts', 'export async function GET() {}');
    const graph = buildApplicationGraph({ dir: '/contract-conflict/src/pages', rootDir: '/contract-conflict', fsModule: memfs });
    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toContain('VX_ROUTE_ACTION_COLLISION');
    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toContain('VX_ROUTE_ENDPOINT_COLLISION');
  });

  it('rejects incorrectly typed route policy values', () => {
    memfs.rmSync('/config-invalid', { recursive: true, force: true });
    write('/config-invalid/src/pages/index.vx', PAGE);
    write('/config-invalid/src/pages/index.route.json', JSON.stringify({
      preserve: { state: 'yes' },
      metadata: { title: 42 },
      redirect: { to: '/next', replace: 'yes' }
    }));
    const graph = buildApplicationGraph({ dir: '/config-invalid/src/pages', rootDir: '/config-invalid', fsModule: memfs });
    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toContain('VX_ROUTE_CONFIG_INVALID');
  });

  it('requires layouts to render the declared route outlet', () => {
    memfs.rmSync('/layout-invalid', { recursive: true, force: true });
    write('/layout-invalid/src/pages/_layout.vx', `#script
  content route: required
#end script
#view
  Text("Missing outlet")
#end view`);
    write('/layout-invalid/src/pages/index.vx', PAGE);
    const graph = buildApplicationGraph({ dir: '/layout-invalid/src/pages', rootDir: '/layout-invalid', fsModule: memfs });
    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toContain('VX_ROUTE_LAYOUT_OUTLET');
  });

  it('rejects duplicate and runtime-reserved parameter names', () => {
    memfs.rmSync('/parameter-invalid', { recursive: true, force: true });
    write('/parameter-invalid/src/pages/[route].vx', PAGE);
    write('/parameter-invalid/src/pages/users/[id]/posts/[id].vx', PAGE);
    const graph = buildApplicationGraph({ dir: '/parameter-invalid/src/pages', rootDir: '/parameter-invalid', fsModule: memfs });
    expect(graph.diagnostics.filter((diagnostic) => diagnostic.code === 'VX_ROUTE_SEGMENT_INVALID')).toHaveLength(2);
  });

  it('retains the compatibility page table API', () => {
    memfs.rmSync('/legacy', { recursive: true, force: true });
    write('/legacy/src/pages/index.vx', PAGE);
    write('/legacy/src/pages/about.vx', PAGE);
    const routes = scanRoutes({ dir: '/legacy/src/pages', fsModule: memfs });
    expect(routes.map((route) => route.path)).toEqual(['/about', '/']);
  });
});
