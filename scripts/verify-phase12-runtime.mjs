import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { schema, createForm, decodeFormData } from '../packages/forms/dist/index.js';
import { createServerForm, dispatchServerForm, registerServerForm, renderMethodOverride, serverFormAttributes } from '../packages/forms/dist/server.js';
import { createCsrfToken, createRequestRuntime, createServerRenderContext } from '../packages/runtime/dist/server.js';
import { createServerApplication } from '../packages/router/dist/server.js';
import { parseRoutePath } from '../packages/router/dist/index.js';
import { compileComponentProject } from '../packages/compiler/dist/project.js';

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const registration = schema.object({
  profile: schema.object({ name: schema.string().min(2), email: schema.email() }),
  age: schema.integer().min(13),
  tags: schema.array(schema.string()).min(1),
  accepted: schema.boolean(),
  avatar: schema.optional(schema.file().maxSize(10).mime('text/plain'))
});
const valid = await registration.parseAsync({ profile: { name: 'Ada', email: 'ada@example.com' }, age: '20', tags: 'vx', accepted: 'on' });
assert.equal(valid.success, true);
assert.deepEqual(valid.value?.tags, ['vx']);
const invalid = registration.parse({ profile: { name: 'A', email: 'bad' }, age: '12', tags: [], accepted: 'maybe' });
assert.equal(invalid.success, false);
assert(invalid.issues.some((issue) => issue.path === 'profile.name'));
assert(invalid.issues.some((issue) => issue.path === 'age'));

const controller = createForm({
  schema: registration,
  initialValues: { profile: { name: 'Ada', email: 'ada@example.com' }, age: 20, tags: ['vx'], accepted: true },
  action: '/_vx/form/test', method: 'post', steps: { account: ['profile.name', 'profile.email'], profile: ['age'] }
});
assert.equal(controller.config.action, '/_vx/form/test');
controller.setValue('profile.name', 'Grace', { touch: true });
assert.equal(controller.snapshot.dirty, true);
assert.equal(controller.field('profile.name').touched, true);
controller.append('tags', 'forms');
controller.move('tags', 1, 0);
assert.deepEqual(controller.getValue('tags'), ['forms', 'vx']);
assert.equal(await controller.nextStep(), true);
assert.equal(controller.snapshot.activeStep, 'profile');
controller.reset();
assert.equal(controller.snapshot.dirty, false);

const data = new FormData();
data.append('profile.name', 'Ada');
data.append('tags', 'vx');
data.append('tags', 'forms');
assert.equal(JSON.stringify(decodeFormData(data)), JSON.stringify({ profile: { name: 'Ada' }, tags: ['vx', 'forms'] }));
const polluted = new FormData(); polluted.append('__proto__.polluted', 'yes');
assert.throws(() => decodeFormData(polluted), /Unsafe form path/);

const secureHandler = createServerForm({
  schema: schema.object({ name: schema.string().min(2) }),
  method: 'POST', authorization: 'authenticated', csrf: 'required', expectedOrigin: 'http://vx.local',
  authorize: () => true, verifyCsrf: (_request, token) => token === 'valid',
  action: ({ values }) => ({ ok: true, status: 201, data: values, redirect: '/done' })
});
const badCsrf = await secureHandler(new Request('http://vx.local/form', { method: 'POST', headers: { origin: 'http://vx.local' }, body: new URLSearchParams({ name: 'Ada' }) }));
assert.equal(badCsrf.status, 403);
const good = await secureHandler(new Request('http://vx.local/form', { method: 'POST', headers: { origin: 'http://vx.local', 'x-vx-csrf': 'valid', accept: 'application/json' }, body: new URLSearchParams({ name: 'Ada' }) }));
assert.equal(good.status, 201);
assert.equal((await good.json()).ok, true);
const htmlRedirect = await secureHandler(new Request('http://vx.local/form', { method: 'POST', headers: { origin: 'http://vx.local', 'x-vx-csrf': 'valid', accept: 'text/html' }, body: new URLSearchParams({ name: 'Ada' }) }));
assert.equal(htmlRedirect.status, 303);
assert.equal(htmlRedirect.headers.get('location'), '/done');

const patchHandler = createServerForm({
  schema: schema.object({ name: schema.string().min(2) }),
  method: 'PATCH', authorization: 'public', csrf: 'same-origin', expectedOrigin: 'http://vx.local',
  action: ({ values }) => ({ ok: true, status: 200, data: values })
});
const nativePatch = await patchHandler(new Request('http://vx.local/form', {
  method: 'POST', headers: { origin: 'http://vx.local' },
  body: new URLSearchParams({ _vx_method: 'PATCH', name: 'Ada' })
}));
assert.equal(nativePatch.status, 200);
assert.equal((await nativePatch.json()).ok, true);
const wrongOverride = await patchHandler(new Request('http://vx.local/form', {
  method: 'POST', headers: { origin: 'http://vx.local' },
  body: new URLSearchParams({ _vx_method: 'PUT', name: 'Ada' })
}));
assert.equal(wrongOverride.status, 405);
assert.equal(serverFormAttributes({ config: { action: '/form', method: 'patch' } }).method, 'post');
assert.equal(serverFormAttributes({ config: { action: '/form', method: 'patch' } })['data-vx-method'], 'patch');
assert(renderMethodOverride('patch').includes('value="PATCH"'));

const formId = `phase12:${Date.now()}`;
registerServerForm({ id: formId, name: 'registration', schema: 'Registration', method: 'POST', authorization: 'authenticated', csrf: 'required' }, {
  schema: schema.object({ name: schema.string().min(2) }),
  action: ({ values }) => ({ ok: true, status: 200, data: values })
});
const dispatched = await dispatchServerForm(new Request('http://vx.local/_vx/form/' + encodeURIComponent(formId), { method: 'POST', headers: { origin: 'http://vx.local', 'x-vx-csrf': 'token' }, body: new URLSearchParams({ name: 'Ada' }) }), {
  formId, expectedOrigin: 'http://vx.local', authorize: () => true, verifyCsrf: (_request, token) => token === 'token'
});
assert.equal(dispatched.status, 200);
assert.throws(() => registerServerForm({ id: formId, name: 'other', schema: 'Other', method: 'POST', authorization: 'authenticated', csrf: 'required' }, { schema: schema.object({}), action: () => ({ ok: true, status: 200 }) }), /conflicting contract/);

const secret = 'phase12-secret-at-least-thirty-two-bytes'; const sessionId = 'session-1';
const routerFormId = `router:${Date.now()}`;
registerServerForm({ id: routerFormId, name: 'router', schema: 'Router', method: 'POST', authorization: 'authenticated', csrf: 'required' }, {
  schema: schema.object({ name: schema.string() }), action: ({ values }) => ({ ok: true, status: 200, data: values })
});
const application = createServerApplication({ routes: [], csrfSecret: secret, resolveSessionId: () => sessionId });
const token = await createCsrfToken({ secret, binding: sessionId });
const routed = await application.handle(new Request('http://vx.local/_vx/form/' + encodeURIComponent(routerFormId), { method: 'POST', headers: { origin: 'http://vx.local', 'x-vx-csrf': token }, body: new URLSearchParams({ name: 'Ada' }) }));
assert.equal(routed.status, 200);

const generatedRoot = await mkdtemp(join(workspace, '.phase12-runtime-'));
try {
  const sourcePath = join(generatedRoot, 'FormPage.vx');
  await writeFile(sourcePath, `#script
  schema Person {
    name: String | min(2)
    password: String | min(8) | sensitive
  }
  server action save(values: Person): Any { return { ok: true, status: 200, data: values } }
  form person: Person {
    action: save
    initial: { name: "Ada", password: "" }
    method: "post"
    authorization: "public"
    csrf: "required"
  }
#end script
#view
  Form {
    controller: person
    Input {
      field: "name"
      ariaLabel: "Name"
    }
    FieldError { field: "name" }
    Input {
      field: "password"
      type: "password"
      ariaLabel: "Password"
    }
    ErrorSummary { controller: person }
  }
#end view
`, 'utf8');
  const project = compileComponentProject(sourcePath, { rootDir: generatedRoot });
  assert.deepEqual(project.diagnostics, []);
  const artifact = [...project.artifacts.values()][0];
  const resolvedServerCode = artifact.serverCode
    .replace(/'@vx\/forms\/server'/g, `'${pathToFileURL(join(workspace, 'packages/forms/dist/server.js')).href}'`)
    .replace(/'@vx\/forms'/g, `'${pathToFileURL(join(workspace, 'packages/forms/dist/index.js')).href}'`)
    .replace(/'@vx\/runtime\/server'/g, `'${pathToFileURL(join(workspace, 'packages/runtime/dist/server.js')).href}'`)
    .replace(/'@vx\/runtime'/g, `'${pathToFileURL(join(workspace, 'packages/runtime/dist/index.js')).href}'`);
  const serverPath = join(generatedRoot, 'form-page.server.mjs');
  await writeFile(serverPath, resolvedServerCode, 'utf8');
  const module = await import(`${pathToFileURL(serverPath).href}?phase12=${Date.now()}`);
  const runtime = createRequestRuntime({ requestId: 'phase12', applicationId: 'vx', routeId: 'form' });
  const context = createServerRenderContext({ runtime, routeId: 'form', requestURL: new URL('http://vx.local/form'), csrfToken: 'csrf-token' });
  const html = await module.renderComponent({}, context, {});
  assert(html.includes('name="_vx_csrf"'));
  assert(html.includes('value="csrf-token"'));
  assert(html.includes('value="Ada"'));
  assert(html.includes('action="/_vx/form/'));
  assert(!html.includes('controller="'));
  assert(!html.includes('field="'));

  const parsedRoute = parseRoutePath(['form']);
  const route = {
    id: 'phase12-form-route', name: 'phase12.form', ...parsedRoute,
    pagePath: sourcePath, layoutPaths: [], loaderPaths: [], middlewarePaths: [], boundaries: {}, queries: [], actions: [], score: parsedRoute.score,
    forms: [{ name: 'person', modulePath: sourcePath }],
    policy: {
      render: 'server', preload: 'none', hydration: 'full', streaming: 'blocking', generation: { mode: 'dynamic', entries: [] },
      metadata: { title: 'Form' }, preserve: { state: false, scroll: true, focus: true },
      navigation: { trailingSlash: 'never', caseSensitive: true, announce: true, viewTransition: false }, search: []
    },
    loadPage: async () => module,
    loadLayouts: []
  };
  const progressive = createServerApplication({ routes: [route], csrfSecret: secret });
  const initial = await progressive.render('http://vx.local/form');
  const initialHtml = await initial.text();
  const action = /action="([^"]+)"/.exec(initialHtml)?.[1];
  const progressiveToken = /name="_vx_csrf" value="([^"]+)"/.exec(initialHtml)?.[1];
  const csrfBindingCookie = initial.headers.get('set-cookie')?.split(';', 1)[0];
  assert(action && progressiveToken && csrfBindingCookie?.startsWith('__vx_csrf_binding='));
  const invalidPost = await progressive.handle(new Request(new URL(action, 'http://vx.local'), {
    method: 'POST',
    headers: { origin: 'http://vx.local', referer: 'http://vx.local/form', accept: 'text/html', cookie: csrfBindingCookie },
    body: new URLSearchParams({ _vx_csrf: progressiveToken, name: 'A', password: 'super-secret-value' })
  }));
  assert.equal(invalidPost.status, 303);
  assert.equal(invalidPost.headers.get('location'), '/form');
  const flashCookie = invalidPost.headers.get('set-cookie')?.split(';', 1)[0];
  assert(flashCookie?.startsWith('__vx_form_flash='));
  const browserCookies = `${csrfBindingCookie}; ${flashCookie}`;
  const failedGet = await progressive.handle(new Request('http://vx.local/form', { headers: { cookie: browserCookies } }));
  const failedHtml = await failedGet.text();
  assert(failedHtml.includes('value="A"'));
  assert(failedHtml.includes('aria-invalid'));
  assert(failedHtml.includes('aria-describedby'));
  assert(failedHtml.includes('-name-error'));
  assert(failedHtml.includes('href="#'));
  assert(failedHtml.includes('Must contain at least 2 characters.'));
  assert(!failedHtml.includes('super-secret-value'));
  assert(failedHtml.includes('"forms"'));
  assert(failedGet.headers.get('set-cookie')?.includes('Max-Age=0'));
  const consumedGet = await progressive.handle(new Request('http://vx.local/form', { headers: { cookie: browserCookies } }));
  const consumedHtml = await consumedGet.text();
  assert(!consumedHtml.includes('Must contain at least 2 characters.'));

  context.dispose(); runtime.dispose();
} finally {
  await rm(generatedRoot, { recursive: true, force: true });
}

console.log('Phase 12 schema, controller, multipart, security, registry, router dispatch, and SSR verification passed.');
