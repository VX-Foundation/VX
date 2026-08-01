import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileComponentProject } from '../packages/compiler/dist/project.js';
import { state } from '../packages/runtime/dist/client.js';
import { compareHMRSignatures, createHMRSignature } from '../packages/tooling/dist/hmr.js';
import { formatVX, VXLanguageService } from '../packages/tooling/dist/index.js';
import { FakeElement, installFakeDom } from './test-support/fake-dom.mjs';

installFakeDom();
const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const root = await mkdtemp(join(tmpdir(), 'vx-phase11-'));
try {
  const fieldPath = join(root, 'Field.vx');
  const appPath = join(root, 'App.vx');
  await writeFile(fieldPath, `#script
  generic Item
  prop item: Item
  model value: String = "" emits change
  inject theme: String = "light"
  forward attributes
  forward events
  forward class
  forward style
  content default: optional

  action mutate() {
    value = value + "!"
  }

  @mount
    runtime.record?.("mount")
  @end mount

  @update
    runtime.record?.("update:" + value)
  @end update

  @unmount
    runtime.record?.("unmount")
  @end unmount
#end script

#view
  View @forward {
    Text(theme)
    Text(item)
    Text(value)
    Button("Update") {
      click => mutate()
    }
    Content(default)
  }
#end view
`, 'utf8');
  await writeFile(appPath, `#script
  import Field from "./Field.vx"
  state selected: String = "ready"
  prop fieldRef: Any
  prop portalTarget: Any
  provide theme: String = "dark"

  action receive(value: String) {
    selected = value
  }
#end script

#view
  View {
    Field {
      item: selected
      value: selected
      change => receive($event)
      class: "field"
      style: { opacity: 1 }
      dataTestId: "direct-field"
      click => receive(selected)
      ref: fieldRef
      Text("Projected")
    }
    Dynamic(Field) {
      item: selected
      value: selected
      change => receive($event)
      content loading { Text("Loading") }
      content error { Text("Failed") }
    }
    Portal(portalTarget) {
      Text("Portal")
    }
  }
#end view
`, 'utf8');

  const result = compileComponentProject(appPath, { rootDir: root, frameworkVersion: '0.1.0' });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.artifacts.size, 2);
  const field = [...result.artifacts.values()].find((artifact) => artifact.filePath === fieldPath);
  const app = [...result.artifacts.values()].find((artifact) => artifact.filePath === appPath);
  assert(field && app);
  assert.deepEqual(field.contract.generics.map((item) => item.name), ['Item']);
  assert(field.contract.props.some((prop) => prop.model && prop.modelOutput === 'change'));
  assert.deepEqual(field.contract.forwarding, { attributes: true, events: true, class: true, style: true });
  for (const needle of ['componentModel(', 'acquireComponentContext(', 'applyForwardedBindings(', 'onComponentScopeMount(', 'assignComponentRef(']) {
    assert(field.clientCode.includes(needle), `Field client output must contain ${needle}`);
  }
  assert(app.clientCode.includes('dynamicComponentMount('));
  assert(app.clientCode.includes('portalMount('));
  assert(field.serverCode.includes('acquireComponentContext('));
  assert(app.serverCode.includes('provideComponentContext('));
  const signature = createHMRSignature(await readFile(fieldPath, 'utf8'), field.contract);
  const incompatible = compareHMRSignatures(signature, { ...signature, forwarding: [] });
  assert.equal(incompatible.compatible, false);
  assert.equal(incompatible.preserveState, false);
  assert(incompatible.reasons.includes('The forwarding contract changed.'));

  const runtimeUrl = pathToFileURL(join(workspace, 'packages/runtime/dist/client.js')).href;
  for (const artifact of result.artifacts.values()) {
    await writeFile(join(root, artifact.outputFileName), artifact.clientCode.replaceAll("'@vx-foundation/runtime/client'", JSON.stringify(runtimeUrl)), 'utf8');
  }

  const fieldModule = await import(`${pathToFileURL(join(root, field.outputFileName)).href}?field=${Date.now()}`);
  const lifecycle = [];
  const standaloneRef = { current: null };
  const standaloneValue = state('initial');
  const standalone = fieldModule.createComponent(
    { item: 'standalone', value: standaloneValue },
    { record: (entry) => lifecycle.push(entry) },
    {},
    {},
    {},
    { ref: standaloneRef }
  );
  assert.equal(standaloneRef.current, null, 'component refs must remain unpublished while detached');
  standaloneValue.value = 'detached';
  await settle();
  assert.equal(lifecycle.some((entry) => entry.startsWith('update:')), false, 'detached components must not run update lifecycle work');
  const standaloneHost = new FakeElement('main');
  standaloneHost.appendChild(standalone.node);
  standalone.mount();
  assert(standaloneRef.current, 'component ref must be published after mount');
  assert(lifecycle.includes('mount'));
  standaloneValue.value = 'mounted';
  await settle();
  assert(lifecycle.includes('update:mounted'));
  standalone.dispose();
  assert.equal(standaloneRef.current, null);
  assert(lifecycle.includes('unmount'));
  standaloneValue.dispose();

  const appModule = await import(`${pathToFileURL(join(root, app.outputFileName)).href}?app=${Date.now()}`);
  const rootElement = new FakeElement('main');
  const portalTarget = new FakeElement('aside');
  const fieldRef = { current: null };
  const dispose = appModule.default(rootElement, { fieldRef, portalTarget });
  assert(fieldRef.current, 'nested component ref must be assigned after application mount');
  assert.equal(portalTarget.textContent, 'Portal');
  assert(rootElement.textContent.includes('dark'));
  assert(rootElement.textContent.includes('Projected'));
  const forwarded = rootElement.querySelector('[data-testid]');
  assert(forwarded);
  assert.equal(forwarded.getAttribute('data-testid'), 'direct-field');
  assert(forwarded.classList.contains('field'));

  const button = rootElement.querySelectorAll('*').find((node) => node.tagName === 'BUTTON');
  assert(button);
  button.dispatch('click');
  await settle();
  assert(rootElement.textContent.includes('ready!'));
  dispose();
  assert.equal(fieldRef.current, null);
  assert.equal(rootElement.childNodes.length, 0);
  assert.equal(portalTarget.childNodes.length, 0);

  const conflictRoot = await mkdtemp(join(tmpdir(), 'vx-phase11-conflict-'));
  try {
    await writeFile(join(conflictRoot, 'Generic.vx'), `#script
  generic T
  prop first: T
  prop second: T
#end script
#view
  Text(first)
#end view
`, 'utf8');
    await writeFile(join(conflictRoot, 'Use.vx'), `#script
  import Generic from "./Generic.vx"
#end script
#view
  Generic {
    first: "text"
    second: 42
  }
#end view
`, 'utf8');
    const conflict = compileComponentProject(join(conflictRoot, 'Use.vx'), { rootDir: conflictRoot });
    assert(conflict.diagnostics.some((diagnostic) => diagnostic.code === 'VX_COMPONENT_GENERIC_CONFLICT'));
  } finally {
    await rm(conflictRoot, { recursive: true, force: true });
  }

  const toolingSource = formatVX(`#script
generic T: String
model value: T = "initial" emits change
provide theme: String = "dark"
inject locale: String = "en"
forward attributes
forward events
#end script
#view
View @forward {
Dynamic(component: Self)
Portal(target: document.body) {
Text(value)
}
}
#end view
`, '/ComponentModel.vx').code;
  const languageService = new VXLanguageService();
  const snapshot = languageService.open('/ComponentModel.vx', toolingSource, 1);
  for (const [name, kind] of [['T', 'generic'], ['value', 'model'], ['theme', 'context'], ['locale', 'context']]) {
    assert(snapshot.symbols.some((symbol) => symbol.name === name && symbol.kind === kind), `Tooling must expose ${name} as ${kind}.`);
  }
  const completions = new Set(languageService.completions('/ComponentModel.vx', toolingSource.length).map((entry) => entry.label));
  for (const label of ['generic', 'model', 'provide', 'inject', 'forward', 'Dynamic', 'Portal', 'Self']) {
    assert(completions.has(label), `Tooling must complete ${label}.`);
  }
  const directiveOffset = toolingSource.indexOf('@forward') + 1;
  const directives = new Set(languageService.completions('/ComponentModel.vx', directiveOffset).map((entry) => entry.label));
  for (const label of ['forward', 'mount', 'update', 'unmount']) {
    assert(directives.has(label), `Tooling must complete @${label}.`);
  }

  console.log('VX Phase 11 verification passed (contracts, generics, models, context, forwarding, refs, lifecycle, dynamic components, portals, SSR, tooling, and cleanup).');
} finally {
  await rm(root, { recursive: true, force: true });
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
