import { describe, expect, it } from 'vitest';
import { fs as memfs } from 'memfs';
import {
  buildApplicationGraph,
  createRouteCatalog,
  decodeRouteSearch,
  executeRoutePipeline,
  parseRoutePath,
  renderRouteMetadata
} from '../src/index.js';
import type { RouteLoaderContext, RouteMiddlewareContext, RouteMiddlewareResult, RouteRecord } from '../src/types.js';

const PAGE = `#view
  View {
    Text("Page")
  }
#end view`;

const PARAMETER_PAGE = `#script
  prop id: Int
#end script
#view
  Text(id)
#end view`;

const LAYOUT = `#script
  content route: required
#end script
#view
  View {
    Content(route)
  }
#end view`;

function write(filePath: string, source: string): void {
  const directory = filePath.slice(0, filePath.lastIndexOf('/'));
  memfs.mkdirSync(directory, { recursive: true });
  memfs.writeFileSync(filePath, source);
}

describe('Phase 10 final router contract', () => {
  it('discovers canonical route files and preserves legacy aliases', () => {
    memfs.rmSync('/phase10', { recursive: true, force: true });
    write('/phase10/src/pages/layout.vx', LAYOUT);
    write('/phase10/src/pages/loading.vx', PAGE);
    write('/phase10/src/pages/error.vx', PAGE);
    write('/phase10/src/pages/not-found.vx', PAGE);
    write('/phase10/src/pages/middleware.ts', 'export async function middleware(_context, next) { return next(); }');
    write('/phase10/src/pages/loader.ts', 'export async function load() { return { shell: true }; }');
    write('/phase10/src/pages/page.vx', PAGE);
    write('/phase10/src/pages/route.json', JSON.stringify({ name: 'home', metadata: { title: 'Home' } }));
    write('/phase10/src/pages/users/[id.integer]/page.vx', PARAMETER_PAGE);
    write('/phase10/src/pages/users/[id.integer]/route.json', JSON.stringify({
      name: 'user.details',
      navigation: { trailingSlash: 'always', caseSensitive: false },
      search: [{ name: 'tab', kind: 'slug', required: false, repeat: false, defaultValue: 'profile' }]
    }));
    write('/phase10/src/pages/users/[id.integer]/loader.ts', 'export const load = async ({ parentData }) => ({ user: parentData.shell });');
    write('/phase10/src/pages/users/[id.integer]/endpoint.ts', 'export async function GET() {}');

    const graph = buildApplicationGraph({ dir: '/phase10/src/pages', rootDir: '/phase10', fsModule: memfs });
    expect(graph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(graph.routes.find((route) => route.path === '/')?.name).toBe('home');
    const user = graph.routes.find((route) => route.path === '/users/:id')!;
    expect(user.name).toBe('user.details');
    expect(user.layoutPaths).toEqual(['/phase10/src/pages/layout.vx']);
    expect(user.loaderPaths?.map((entry) => entry.modulePath)).toEqual([
      '/phase10/src/pages/loader.ts',
      '/phase10/src/pages/users/[id.integer]/loader.ts'
    ]);
    expect(user.middlewarePaths?.map((entry) => entry.modulePath)).toEqual(['/phase10/src/pages/middleware.ts']);
    expect(user.policy.navigation).toEqual(expect.objectContaining({ trailingSlash: 'always', caseSensitive: false }));
    expect(graph.endpoints[0]).toEqual(expect.objectContaining({ path: '/users/:id', methods: ['GET'] }));
  });

  it('builds named URLs and validates typed query strings', () => {
    const parsed = parseRoutePath(['users', '[id.integer]']);
    const route: RouteRecord = {
      id: 'route:/users/:id', name: 'user.details', ...parsed,
      layoutPaths: [], boundaries: {}, loaderPaths: [], middlewarePaths: [],
      policy: {
        render: 'client', preload: 'none', hydration: 'islands', streaming: 'blocking',
        generation: { mode: 'dynamic', entries: [] }, metadata: {},
        preserve: { state: false, scroll: true, focus: true },
        navigation: { trailingSlash: 'always', caseSensitive: true, announce: true, viewTransition: false },
        search: [{ name: 'tab', kind: 'slug', required: true, repeat: false }]
      },
      queries: [], actions: [], score: parsed.score
    };
    const catalog = createRouteCatalog([route]);
    expect(catalog.get('user.details').build({ id: 42 }, { query: { tab: 'activity' }, hash: 'history' }))
      .toBe('/users/42/?tab=activity#history');
    expect(() => catalog.get('user.details').build({ id: 42 })).toThrow(/tab.*required/i);
    expect(() => catalog.get('user.details').build({ id: 42 }, { query: { tab: 'not valid' } })).toThrow(/cannot decode/i);
  });

  it('executes middleware around hierarchical loaders with parent data', async () => {
    const order: string[] = [];
    const parsed = parseRoutePath(['dashboard']);
    const route = {
      id: 'dashboard', ...parsed,
      policy: {
        render: 'client' as const, preload: 'none' as const, hydration: 'islands' as const,
        streaming: 'blocking' as const, generation: { mode: 'dynamic' as const, entries: [] }, metadata: {},
        preserve: { state: false, scroll: true, focus: true }, search: []
      },
      loadMiddleware: [async () => ({ middleware: async (_context: RouteMiddlewareContext, next: () => Promise<RouteMiddlewareResult>) => {
        order.push('middleware:before');
        const result = await next();
        order.push('middleware:after');
        return result;
      } })],
      loadLoaders: [
        async () => ({ load: async () => { order.push('loader:root'); return { account: 7 }; } }),
        async () => ({ load: async ({ parentData }: RouteLoaderContext) => { order.push('loader:page'); return { doubled: Number(parentData['account']) * 2 }; } })
      ]
    };
    const location = {
      id: route.id, path: route.path, pathname: route.path, search: new URLSearchParams(), hash: '', params: {}, url: new URL('https://vx.test/dashboard')
    };
    const result = await executeRoutePipeline({ route, location, signal: new AbortController().signal });
    expect(result.data).toEqual({ account: 7, doubled: 14 });
    expect(order).toEqual(['middleware:before', 'loader:root', 'loader:page', 'middleware:after']);
  });

  it('decodes repeated and defaulted search values and rejects malformed values', () => {
    const contract = [
      { name: 'page', kind: 'integer' as const, required: false, repeat: false, defaultValue: 1 },
      { name: 'tag', kind: 'slug' as const, required: false, repeat: true }
    ];
    expect(decodeRouteSearch(new URLSearchParams('tag=web&tag=compiler'), contract)).toEqual({ page: 1, tag: ['web', 'compiler'] });
    expect(() => decodeRouteSearch(new URLSearchParams('page=1.5'), contract)).toThrow(/integer/);
  });

  it('renders inherited SEO metadata without unsafe script termination', () => {
    const html = renderRouteMetadata({
      title: 'User', titleTemplate: '%s · VX', canonical: 'https://vx.test/users/1',
      alternates: [{ language: 'pt-BR', href: 'https://vx.test/pt/users/1' }],
      openGraph: { type: 'profile', images: ['/user.png'] },
      twitter: { card: 'summary_large_image', images: ['/user.png'] },
      structuredData: { '@context': 'https://schema.org', name: '</script><script>alert(1)</script>' }
    });
    expect(html).toContain('property="og:title" content="User · VX"');
    expect(html).toContain('hreflang="pt-BR"');
    expect(html).not.toContain('</script><script>alert(1)</script>');
  });
});
