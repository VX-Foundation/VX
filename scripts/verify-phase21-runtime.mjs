import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(root, '.vx-phase21-runtime-'));
try {
  const sources = [
    'apps/official-dashboard/src/domain/dashboard.ts',
    'apps/official-dashboard/src/server/auth.ts',
    'apps/official-commerce/src/domain/catalog.ts',
    'apps/official-commerce/src/server/security.ts',
    'apps/official-collaboration/src/domain/collaboration.ts'
  ].map((path) => resolve(root, path));
  const compilation = spawnSync(process.platform === 'win32' ? 'pnpm' : 'tsc', [
    ...(process.platform === 'win32' ? ['tsc'] : []),
    ...sources,
    '--outDir', temporary,
    '--rootDir', root,
    '--target', 'ES2022',
    '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext',
    '--strict',
    '--skipLibCheck',
    '--declaration', 'false',
    '--sourceMap', 'false'
  ], { encoding: 'utf8', shell: true });
  assert.equal(compilation.status, 0, compilation.stderr || compilation.stdout);
  writeFileSync(join(temporary, 'package.json'), '{"type":"module"}\n');

  function fixImports(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        fixImports(full);
      } else if (full.endsWith('.js')) {
        let code = readFileSync(full, 'utf8');
        code = code
          .replace(/'@vx\/server'/g, `'${pathToFileURL(join(root, 'packages/server/dist/index.js')).href}'`)
          .replace(/'@vx\/server\/([a-zA-Z0-9_-]+)'/g, (_, sub) => `'${pathToFileURL(join(root, `packages/server/dist/${sub}.js`)).href}'`)
          .replace(/'@vx\/runtime'/g, `'${pathToFileURL(join(root, 'packages/runtime/dist/index.js')).href}'`)
          .replace(/'@vx\/runtime\/([a-zA-Z0-9_-]+)'/g, (_, sub) => `'${pathToFileURL(join(root, `packages/runtime/dist/${sub}.js`)).href}'`)
          .replace(/'@vx\/data'/g, `'${pathToFileURL(join(root, 'packages/data/dist/index.js')).href}'`)
          .replace(/'@vx\/data\/([a-zA-Z0-9_-]+)'/g, (_, sub) => `'${pathToFileURL(join(root, `packages/data/dist/${sub}.js`)).href}'`);
        writeFileSync(full, code, 'utf8');
      }
    }
  }
  fixImports(temporary);

  const dashboard = await importFresh(join(temporary, 'apps/official-dashboard/src/domain/dashboard.js'));
  assert.deepEqual(dashboard.summarizeMetrics([
    { at: '1', revenue: 12, users: 3 },
    { at: '2', revenue: 8, users: 5 }
  ]), { revenue: 20, users: 5 });
  assert.equal(dashboard.canSuspend('admin', 'viewer'), true);
  assert.equal(dashboard.canSuspend('admin', 'admin'), false);
  assert.equal(dashboard.filterUsers([{ id: '1', name: 'Ada', role: 'admin', status: 'active' }], 'ADMIN').length, 1);

  const dashboardAuth = await importFresh(join(temporary, 'apps/official-dashboard/src/server/auth.js'));
  const dashboardEnvironment = {
    DASHBOARD_SESSION_SECRET: 'phase21-dashboard-session-secret-at-least-32-bytes',
    DASHBOARD_DEMO_PASSWORD: 'phase21-demo-password'
  };
  const principal = dashboardAuth.authenticateDashboardCredentials('admin@vx.example', 'phase21-demo-password', dashboardEnvironment);
  assert.equal(principal?.roles?.[0], 'admin');
  assert.equal(dashboardAuth.authenticateDashboardCredentials('admin@vx.example', 'wrong-password', dashboardEnvironment), undefined);
  const sessionManager = dashboardAuth.dashboardSessionManagerFromEnvironment(dashboardEnvironment);
  const firstSession = await sessionManager.resolve(new Request('https://vx.test/'));
  firstSession.session.principal = principal;
  const sessionHeaders = new Headers();
  await firstSession.commit(sessionHeaders);
  const sessionCookie = sessionHeaders.get('set-cookie')?.split(';', 1)[0];
  assert.ok(sessionCookie);
  const restoredSession = await sessionManager.resolve(new Request('https://vx.test/', { headers: { cookie: sessionCookie } }));
  assert.equal(restoredSession.session.principal?.id, 'admin@vx.example');

  const commerce = await importFresh(join(temporary, 'apps/official-commerce/src/domain/catalog.js'));
  const products = [
    { id: 'camera', name: 'VX Camera', category: 'devices', price: 849, stock: 5 },
    { id: 'keyboard', name: 'Compiler Keyboard', category: 'accessories', price: 499, stock: 8 }
  ];
  assert.deepEqual(commerce.filterCatalog(products, 'camera', 'devices').map((item) => item.id), ['camera']);
  const cart = commerce.changeCart([], 'camera', 2, 849);
  assert.equal(commerce.cartTotal(cart), 1698);
  assert.equal(commerce.changeCart(cart, 'camera', 0, 849).length, 0);

  const commerceSecurity = await importFresh(join(temporary, 'apps/official-commerce/src/server/security.js'));
  const csrfSecret = 'phase21-commerce-csrf-secret-at-least-32-bytes';
  const runtimeServer = await import(pathToFileURL(resolve(root, 'packages/runtime/dist/server.js')).href);
  const csrfToken = await runtimeServer.createCsrfToken({ secret: csrfSecret, binding: 'seller' });
  const csrfRequest = new Request('https://vx.test/api/listings', { method: 'POST', headers: { 'x-demo-user': 'seller' } });
  assert.equal(await commerceSecurity.verifyCommerceCsrf(csrfRequest, csrfToken, { COMMERCE_CSRF_SECRET: csrfSecret }), true);
  assert.equal(await commerceSecurity.verifyCommerceCsrf(csrfRequest, `${csrfToken}x`, { COMMERCE_CSRF_SECRET: csrfSecret }), false);

  const collaboration = await importFresh(join(temporary, 'apps/official-collaboration/src/domain/collaboration.js'));
  const document = { id: 'doc', version: 4, body: 'remote', updatedBy: 'ada' };
  const accepted = collaboration.applyEdit(document, { id: 'e1', baseVersion: 4, body: 'local', actorId: 'grace' });
  assert.equal(accepted.kind, 'accepted');
  assert.equal(accepted.document.version, 5);
  const conflict = collaboration.applyEdit(document, { id: 'e2', baseVersion: 3, body: 'stale', actorId: 'grace' });
  assert.equal(conflict.kind, 'conflict');
  assert.equal(collaboration.resolveConflict(conflict.local, conflict.remote, 'remote').body, 'remote');
  const presence = collaboration.mergePresence(new Map([['ada', 20]]), 'ada', 10);
  assert.equal(presence.get('ada'), 20);

  const runtime = await import(pathToFileURL(resolve(root, 'packages/runtime/dist/client.js')).href);
  const client = new runtime.QueryClient();
  const resource = runtime.createQuery(client, {
    name: 'phase21.typed-resource',
    input: () => ({ id: 'vx' }),
    source: async ({ id }) => ({ id, version: 1 }),
    initialData: { id: 'vx', version: 0 }
  });
  const refresh = runtime.createAction(async (context) => {
    context.invalidate(resource);
    context.refresh(resource);
    return resource.data;
  }, { name: 'phase21.typed-refresh', queryClient: client });
  assert.deepEqual(await refresh(), { id: 'vx', version: 0 });
  resource.dispose();
  client.dispose();

  const server = await import(pathToFileURL(resolve(root, 'packages/server/dist/index.js')).href);
  const endpoint = server.defineEndpoint(
    { id: 'phase21.endpoint', methods: ['POST'], body: { maxBytes: 4096 } },
    async ({ input, context, params }) => {
      context.responseHeaders.set('x-vx-phase', '21');
      return { input, projectId: params.projectId ?? null };
    }
  );
  const POST = server.createRouteEndpointHandler(endpoint);
  const response = await POST(new Request('https://vx.test/api/phase21', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"ok":true}'
  }), { params: { projectId: 'official' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-vx-phase'), '21');
  assert.deepEqual(await response.json(), { input: { type: 'json', value: { ok: true } }, projectId: 'official' });

  console.log('Phase 21 runtime verification passed (dashboard authentication, commerce CSRF, collaboration, typed actions, route endpoints).');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

async function importFresh(path) {
  return import(`${pathToFileURL(path).href}?phase21=${Date.now()}-${Math.random()}`);
}
