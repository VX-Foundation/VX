import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileComponentProject } from '../packages/compiler/dist/project.js';
import { parse } from '../packages/language/dist/index.js';
import { VXLanguageService } from '../packages/tooling/dist/index.js';
import { buildApplicationGraph } from '../packages/router/dist/index.js';

const root = await mkdtemp(join(tmpdir(), 'vx-phase12-contract-'));
try {
  const file = join(root, 'Register.vx');
  const source = `#script
  schema RegisterUser {
    name: String | min(2) | max(100)
    email: Email
    age: Int | min(13)
    tags: List<String> | min(1)
    avatar?: File | maxSize(5000000) | mime("image/png", "image/jpeg")
  }

  server action register(values: RegisterUser): Any {
    return { ok: true, status: 201, data: values, redirect: "/welcome" }
  }

  form registration: RegisterUser {
    action: register
    initial: { name: "Ada", email: "ada@example.com", age: 20, tags: ["vx"] }
    method: "post"
    authorization: "public"
    csrf: "required"
    enhance: true
    focusErrors: true
    resetOnSuccess: false
    validateOn: ["input", "blur", "submit"]
    steps: { account: ["name", "email"], profile: ["age", "tags"] }
  }
#end script

#view
  Form {
    controller: registration
    ErrorSummary {
      controller: registration
      title: "Review the form"
    }
    Input {
      field: "name"
      ariaLabel: "Name"
    }
    FieldError {
      field: "name"
    }
    Input {
      field: "email"
      ariaLabel: "Email"
    }
    FormError {
      controller: registration
    }
    Button("Create account") {
      type: "submit"
    }
  }
#end view
`;
  await writeFile(file, source, 'utf8');
  const parsed = parse(source, file);
  assert.deepEqual(parsed.diagnostics, []);
  const script = parsed.ast.blocks.find((block) => block.kind === 'ScriptBlock');
  assert(script?.statements.some((statement) => statement.kind === 'SchemaDeclaration'));
  assert(script?.statements.some((statement) => statement.kind === 'FormDeclaration'));

  const result = compileComponentProject(file, { rootDir: root, frameworkVersion: '0.1.0' });
  assert.deepEqual(result.diagnostics, []);
  const artifact = [...result.artifacts.values()][0];
  assert(artifact);
  for (const needle of ['createForm({', '/_vx/form/', 'bindFormElement(', 'bindFormField(', 'bindFieldError(', 'bindFormError(', 'bindErrorSummary(']) {
    assert(artifact.clientCode.includes(needle), `client output must contain ${needle}`);
  }
  for (const needle of ['registerServerForm(', 'serverFormAttributes(', 'serverFieldAttributes(', 'renderCsrfField(', 'renderMethodOverride(']) {
    assert(artifact.serverCode.includes(needle), `server output must contain ${needle}`);
  }
  assert(artifact.serverCode.includes('\"authorization\":\"public\"'));
  assert(artifact.serverCode.includes('\"csrf\":\"required\"'));

  const headlessFile = join(root, 'forms.vx');
  await writeFile(headlessFile, `#script
  export schema SharedPerson { name: String | min(2) }
  server action persist(values: SharedPerson): Any { return { ok: true, status: 200, data: values } }
  export form sharedPerson: SharedPerson {
    action: persist
    initial: { name: "Ada" }
    method: "post"
  }
#end script
`, 'utf8');
  const headlessResult = compileComponentProject(headlessFile, { rootDir: root });
  assert.deepEqual(headlessResult.diagnostics, []);
  const headlessArtifact = [...headlessResult.artifacts.values()].find((entry) => entry.filePath === headlessFile);
  assert(headlessArtifact?.contract.exports.some((entry) => entry.kind === 'schema' && entry.name === 'SharedPerson'));
  assert(headlessArtifact?.contract.exports.some((entry) => entry.kind === 'form' && entry.name === 'sharedPerson'));

  const localFile = join(root, 'LocalForm.vx');
  await writeFile(localFile, `#script
  schema Search { query: String }
  form search: Search { initial: { query: "" } }
#end script
#view
  Form { controller: search }
#end view
`, 'utf8');
  const localResult = compileComponentProject(localFile, { rootDir: root });
  assert.deepEqual(localResult.diagnostics, []);
  const localArtifact = [...localResult.artifacts.values()].find((entry) => entry.filePath === localFile);
  assert(localArtifact);
  assert(localArtifact.clientCode.includes('action: undefined'));
  assert(!localArtifact.serverCode.includes('registerServerForm('));

  const routeRoot = join(root, 'app');
  const routePages = join(routeRoot, 'src', 'pages');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(routePages, { recursive: true }));
  await writeFile(join(routePages, 'page.vx'), source, 'utf8');
  await writeFile(join(routePages, 'route.json'), JSON.stringify({ render: 'static', generation: { mode: 'static', entries: [] } }), 'utf8');
  const routeGraph = buildApplicationGraph({ dir: routePages, rootDir: routeRoot });
  assert(routeGraph.routes[0]?.forms?.some((form) => form.name === 'registration'));
  assert(routeGraph.diagnostics.some((diagnostic) => diagnostic.code === 'VX_ROUTE_FORM_DYNAMIC_REQUIRED'));

  const language = new VXLanguageService();
  const snapshot = language.open(file, source);
  assert(snapshot.symbols.some((symbol) => symbol.kind === 'schema' && symbol.name === 'RegisterUser'));
  assert(snapshot.symbols.some((symbol) => symbol.kind === 'form' && symbol.name === 'registration'));
  assert(snapshot.symbols.some((symbol) => symbol.kind === 'field' && symbol.name === 'email'));
  assert(language.completions(file, source.indexOf('#script') + 1).some((entry) => entry.label === 'schema'));
  assert(language.completions(file, source.indexOf('#script') + 1).some((entry) => entry.label === 'form'));

  const invalid = join(root, 'Invalid.vx');
  await writeFile(invalid, `#script
  schema Loop { child: Loop }
  action save(value: String) { return value }
  form broken: Missing {
    action: save
    method: "delete"
    authorization: "anonymous"
    csrf: "unknown"
    validateOn: ["blur", "unknown"]
    steps: { account: ["missing"] }
  }
#end script
#view
  View {}
#end view
`, 'utf8');
  const invalidResult = compileComponentProject(invalid, { rootDir: root });
  const codes = new Set(invalidResult.diagnostics.map((diagnostic) => diagnostic.code));
  for (const code of ['VX_SCHEMA_CYCLE', 'VX_FORM_UNKNOWN_SCHEMA', 'VX_FORM_INITIAL_REQUIRED', 'VX_FORM_OPTION_VALUE', 'VX_FORM_ACTION_SERVER', 'VX_FORM_VALIDATE_ON']) assert(codes.has(code), `missing ${code}`);

  console.log('Phase 12 compiler, contract, generated output, public API, and language-service verification passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
