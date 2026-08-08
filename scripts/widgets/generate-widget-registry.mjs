import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { widgets } from '../../packages/widgets/registry/widgets.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, '../..');
const checkOnly = process.argv.includes('--check');
const primitivesDirectory = join(root, 'packages/widgets/src/primitives');
const widgetNames = Object.keys(widgets).sort((left, right) => left.localeCompare(right));
const sourceFiles = readdirSync(primitivesDirectory)
  .filter((file) => file.endsWith('.vx'))
  .map((file) => file.slice(0, -3))
  .sort((left, right) => left.localeCompare(right));

assertEqualLists(widgetNames, sourceFiles, 'canonical registry', 'primitive .vx files');

const definitions = widgetNames.map((name) => {
  const metadata = widgets[name];
  validateMetadata(name, metadata);
  const source = normalizeNewlines(readFileSync(join(primitivesDirectory, `${name}.vx`), 'utf8')).trimEnd() + '\n';
  return Object.freeze({ name, ...metadata, source, ...parseContract(name, source) });
});

const widgetDefinitionDirectory = 'packages/widgets/src/generated/definitions';
const compilerDefinitionDirectory = 'packages/compiler/src/visual/generated/definitions';
const outputs = new Map([
  ['packages/widgets/src/contracts.ts', renderWidgetContracts(definitions)],
  ['packages/widgets/src/index.ts', renderWidgetIndex()],
  ['packages/widgets/src/generated/registry.ts', renderWidgetRegistry(definitions)],
  ['packages/compiler/src/visual/generated/contracts.ts', renderCompilerContracts()],
  ['packages/compiler/src/visual/generated/registry.ts', renderCompilerRegistry(definitions)],
  ['packages/compiler/src/components/validation-constants.generated.ts', renderValidationConstants(definitions)],
  ['packages/compiler/src/codegen/primitive-metadata.generated.ts', renderCodegenMetadata(definitions)],
  ['packages/runtime/src/widget-metadata.generated.ts', renderRuntimeMetadata(definitions)],
  ['packages/tooling/src/widget-registry.generated.ts', renderToolingRegistry(definitions)],
  ['packages/vscode-extension/snippets/widgets.generated.json', renderEditorSnippets(definitions)],
  ['docs/reference/widgets.generated.md', renderDocumentation(definitions)]
]);

for (const definition of definitions) {
  outputs.set(`${widgetDefinitionDirectory}/${definition.name}.ts`, renderWidgetDefinition(definition));
  outputs.set(`${compilerDefinitionDirectory}/${definition.name}.ts`, renderCompilerDefinition(definition));
}

const obsoletePaths = [
  'packages/compiler/src/visual/primitives.generated.ts'
];
const generatedDirectoryExpectations = new Map([
  [widgetDefinitionDirectory, new Set(definitions.map((definition) => `${definition.name}.ts`))],
  [compilerDefinitionDirectory, new Set(definitions.map((definition) => `${definition.name}.ts`))]
]);

let drift = false;
for (const path of new Set([...outputs.keys()].map((path) => dirname(path)))) {
  if (!checkOnly) mkdirSync(join(root, path), { recursive: true });
}

for (const [path, content] of outputs) {
  const absolutePath = join(root, path);
  if (safeRead(absolutePath) === content) continue;
  drift = true;
  if (checkOnly) console.error(`[widget-registry] Generated file is stale or missing: ${path}`);
  else {
    writeFileSync(absolutePath, content);
    console.log(`[widget-registry] Wrote ${path}`);
  }
}

for (const [directory, expectedFiles] of generatedDirectoryExpectations) {
  const absoluteDirectory = join(root, directory);
  const actualFiles = safeDirectoryEntries(absoluteDirectory).filter((file) => file.endsWith('.ts'));
  for (const file of actualFiles) {
    if (expectedFiles.has(file)) continue;
    drift = true;
    const path = `${directory}/${file}`;
    if (checkOnly) console.error(`[widget-registry] Stale generated file: ${path}`);
    else {
      rmSync(join(root, path));
      console.log(`[widget-registry] Removed ${path}`);
    }
  }
}

for (const path of obsoletePaths) {
  const absolutePath = join(root, path);
  if (safeRead(absolutePath) === null) continue;
  drift = true;
  if (checkOnly) console.error(`[widget-registry] Obsolete generated file still exists: ${path}`);
  else {
    rmSync(absolutePath);
    console.log(`[widget-registry] Removed ${path}`);
  }
}

if (checkOnly && drift) {
  console.error('Run `pnpm widgets:generate` and commit the generated files.');
  process.exit(1);
}

console.log(`[widget-registry] ${definitions.length} widgets verified${checkOnly ? ' with no drift' : ''}.`);

function validateMetadata(name, metadata) {
  if (!metadata || typeof metadata !== 'object') throw new TypeError(`Widget '${name}' has no metadata.`);
  if (!/^[a-z][a-z0-9-]*$/.test(metadata.nativeElement)) throw new TypeError(`Widget '${name}' has invalid nativeElement '${metadata.nativeElement}'.`);
  if (!/^[a-z][a-zA-Z0-9]*$/.test(metadata.category)) throw new TypeError(`Widget '${name}' has invalid category '${metadata.category}'.`);
  const groups = new Set(metadata.groups);
  if (groups.size !== metadata.groups.length) throw new TypeError(`Widget '${name}' repeats one or more groups.`);
  for (const group of groups) {
    if (!['container', 'text', 'control', 'media', 'formControl', 'interactive'].includes(group)) {
      throw new TypeError(`Widget '${name}' uses unknown group '${group}'.`);
    }
  }
  if (groups.has('formControl') && !groups.has('control')) throw new TypeError(`Widget '${name}' is a formControl but not a control.`);
  if (metadata.callProperty !== null && typeof metadata.callProperty !== 'string') throw new TypeError(`Widget '${name}' has an invalid callProperty.`);
}

function parseContract(name, source) {
  const scriptMatch = source.match(/#script\s*\n([\s\S]*?)#end script/);
  if (!scriptMatch) throw new TypeError(`Widget '${name}' must declare a #script contract.`);
  const properties = [];
  const events = [];
  const content = [];
  const contractLines = [];
  let privateBlockDepth = 0;

  for (const rawLine of scriptMatch[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    if (privateBlockDepth > 0) {
      privateBlockDepth += braceDelta(line);
      continue;
    }

    const prop = line.match(/^prop\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)(?:\s*=\s*(.+))?$/);
    if (prop) {
      const [, propertyName, rawType, rawDefault] = prop;
      const type = rawType.trim();
      const defaultValue = rawDefault?.trim() ?? null;
      const eventType = unwrapEventType(type);
      properties.push(Object.freeze({
        name: propertyName,
        type,
        required: defaultValue === null && !type.startsWith('Optional<'),
        defaultValue,
        event: eventType !== null
      }));
      if (eventType !== null) events.push(Object.freeze({ name: propertyName, payloadType: eventType }));
      contractLines.push(`  ${line}`);
      continue;
    }

    const output = line.match(/^output\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
    if (output) {
      const [, eventName, rawPayloadType] = output;
      const payloadType = rawPayloadType.trim() || 'Void';
      events.push(Object.freeze({ name: eventName, payloadType }));
      properties.push(Object.freeze({
        name: eventName,
        type: `Optional<Event<${payloadType}>>`,
        required: false,
        defaultValue: null,
        event: true
      }));
      contractLines.push(`  output ${eventName}: ${payloadType}`);
      continue;
    }

    const contentRegion = line.match(/^content\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(required|optional|multiple)$/);
    if (contentRegion) {
      const [, regionName, cardinality] = contentRegion;
      content.push(Object.freeze({ name: regionName, cardinality, required: cardinality === 'required' }));
      contractLines.push(`  content ${regionName}: ${cardinality}`);
      continue;
    }

    if (/^(?:action|effect|query|store|schema|form)\b/.test(line)) {
      privateBlockDepth = Math.max(0, braceDelta(line));
      continue;
    }
    if (/^(?:state|const|derive|provide|inject|forward|model|generic|import)\b/.test(line)) continue;

    throw new TypeError(`Widget '${name}' contains unsupported public contract syntax: ${line}`);
  }

  if (privateBlockDepth !== 0) throw new TypeError(`Widget '${name}' contains an unterminated private declaration block.`);

  const seen = new Set();
  for (const property of properties) {
    if (seen.has(property.name)) throw new TypeError(`Widget '${name}' declares '${property.name}' more than once.`);
    seen.add(property.name);
  }
  const contentNames = new Set();
  for (const region of content) {
    if (contentNames.has(region.name)) throw new TypeError(`Widget '${name}' declares content region '${region.name}' more than once.`);
    contentNames.add(region.name);
  }
  if (widgets[name].callProperty && !seen.has(widgets[name].callProperty)) {
    throw new TypeError(`Widget '${name}' callProperty '${widgets[name].callProperty}' is not declared by its contract.`);
  }

  return {
    contractSource: `#script\n${contractLines.join('\n')}\n#end script\n`,
    properties: Object.freeze(properties),
    events: Object.freeze(events),
    content: Object.freeze(content)
  };
}

function braceDelta(line) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (const character of line) {
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
  }
  return depth;
}

function unwrapEventType(type) {
  const optional = type.match(/^Optional<Event<(.+)>>$/);
  if (optional) return optional[1].trim();
  const direct = type.match(/^Event<(.+)>$/);
  return direct ? direct[1].trim() : null;
}

function renderWidgetContracts(definitions) {
  return `${header('Public widget contract types generated from the canonical registry.')}\n` +
`export type WidgetCategory = ${union(definitions.map((definition) => definition.category))};
export type WidgetGroup = 'container' | 'text' | 'control' | 'media' | 'formControl' | 'interactive';

export interface WidgetPropertyContract {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly defaultValue: string | null;
  readonly event: boolean;
}

export interface WidgetEventContract {
  readonly name: string;
  readonly payloadType: string;
}

export interface WidgetContentContract {
  readonly name: string;
  readonly cardinality: 'required' | 'optional' | 'multiple';
  readonly required: boolean;
}

export interface WidgetDefinition {
  readonly name: string;
  readonly category: WidgetCategory;
  readonly nativeElement: string;
  readonly groups: readonly WidgetGroup[];
  readonly callProperty: string | null;
  readonly defaults: Readonly<Record<string, string>>;
  readonly source: string;
  readonly contractSource: string;
  readonly properties: readonly WidgetPropertyContract[];
  readonly events: readonly WidgetEventContract[];
  readonly content: readonly WidgetContentContract[];
}
`;
}

function renderWidgetIndex() {
  return `${header('Public entrypoint for the generated canonical widget registry.')}\n` +
`export type {
  WidgetCategory,
  WidgetContentContract,
  WidgetDefinition,
  WidgetEventContract,
  WidgetGroup,
  WidgetPropertyContract
} from './contracts.js';
export {
  PRIMITIVE_CONTRACT_SOURCES,
  PRIMITIVE_NAMES,
  PRIMITIVE_SOURCES,
  WIDGET_REGISTRY
} from './generated/registry.js';
export type { PrimitiveName } from './generated/registry.js';
`;
}

function renderWidgetDefinition(definition) {
  return `${header(`${definition.name} public contract generated from the canonical registry.`)}\n` +
`import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze(${literal({
    name: definition.name,
    category: definition.category,
    nativeElement: definition.nativeElement,
    groups: definition.groups,
    callProperty: definition.callProperty,
    defaults: definition.defaults,
    source: definition.source,
    contractSource: definition.contractSource,
    properties: definition.properties,
    events: definition.events,
    content: definition.content
  })} as const) satisfies WidgetDefinition;
`;
}

function renderWidgetRegistry(definitions) {
  const imports = definitions.map((definition) => `import { definition as ${definition.name}Definition } from './definitions/${definition.name}.js';`).join('\n');
  const entries = definitions.map((definition) => `  ${definition.name}: ${definition.name}Definition,`).join('\n');
  return `${header('Canonical public widget registry assembled from generated per-widget contracts.')}\n` +
`import type { WidgetDefinition } from '../contracts.js';
${imports}

export const PRIMITIVE_NAMES = ${literal(definitions.map((definition) => definition.name))} as const;
export type PrimitiveName = typeof PRIMITIVE_NAMES[number];
export const WIDGET_REGISTRY: Readonly<Record<PrimitiveName, WidgetDefinition>> = Object.freeze({
${entries}
});
export const PRIMITIVE_SOURCES: Readonly<Record<PrimitiveName, string>> = Object.freeze(
  Object.fromEntries(PRIMITIVE_NAMES.map((name) => [name, WIDGET_REGISTRY[name].source])) as Record<PrimitiveName, string>
);
export const PRIMITIVE_CONTRACT_SOURCES: Readonly<Record<PrimitiveName, string>> = Object.freeze(
  Object.fromEntries(PRIMITIVE_NAMES.map((name) => [name, WIDGET_REGISTRY[name].contractSource])) as Record<PrimitiveName, string>
);
`;
}

function renderCompilerContracts() {
  return `${header('Compiler widget contract types generated from the canonical registry.')}\n` +
`export interface CompilerWidgetDefinition {
  readonly name: string;
  readonly category: string;
  readonly nativeElement: string;
  readonly groups: readonly string[];
  readonly callProperty: string | null;
  readonly defaults: Readonly<Record<string, string>>;
  readonly contractSource: string;
  readonly properties: readonly Readonly<{ name: string; type: string; required: boolean; event: boolean }>[];
  readonly events: readonly Readonly<{ name: string; payloadType: string }>[];
  readonly content: readonly Readonly<{ name: string; cardinality: 'required' | 'optional' | 'multiple'; required: boolean }>[];
}
`;
}

function renderCompilerDefinition(definition) {
  return `${header(`${definition.name} compiler contract generated from the canonical registry.`)}\n` +
`import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze(${literal({
    name: definition.name,
    category: definition.category,
    nativeElement: definition.nativeElement,
    groups: definition.groups,
    callProperty: definition.callProperty,
    defaults: definition.defaults,
    contractSource: definition.contractSource,
    properties: definition.properties.map(({ name, type, required, event }) => ({ name, type, required, event })),
    events: definition.events,
    content: definition.content
  })} as const) satisfies CompilerWidgetDefinition;
`;
}

function renderCompilerRegistry(definitions) {
  const imports = definitions.map((definition) => `import { definition as ${definition.name}Definition } from './definitions/${definition.name}.js';`).join('\n');
  const entries = definitions.map((definition) => `  ${definition.name}: ${definition.name}Definition,`).join('\n');
  return `${header('Compiler registry assembled from generated per-widget contracts.')}\n` +
`import type { CompilerWidgetDefinition } from './contracts.js';
${imports}

export const PRIMITIVE_NAMES = ${literal(definitions.map((definition) => definition.name))} as const;
export type PrimitiveName = typeof PRIMITIVE_NAMES[number];
export const WIDGET_REGISTRY: Readonly<Record<PrimitiveName, CompilerWidgetDefinition>> = Object.freeze({
${entries}
});
export const PRIMITIVE_SOURCES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(PRIMITIVE_NAMES.map((name) => [name, WIDGET_REGISTRY[name].contractSource]))
);
`;
}

function renderValidationConstants(definitions) {
  const namesFor = (group) => definitions.filter((definition) => definition.groups.includes(group)).map((definition) => definition.name);
  return `${header('Compiler validation groups generated from the canonical widget registry.')}\n` +
`export const CONTAINER_WIDGETS = new Set(${literal(namesFor('container'))});
export const TEXT_WIDGETS = new Set(${literal(namesFor('text'))});
export const CONTROL_WIDGETS = new Set(${literal(namesFor('control'))});
export const MEDIA_WIDGETS = new Set(${literal(namesFor('media'))});
export const FORM_CONTROL_WIDGETS = new Set(${literal(namesFor('formControl'))});
export const INTERACTIVE_WIDGETS = new Set(${literal(namesFor('interactive'))});
export const PRIMITIVE_WIDGETS = new Set(${literal(definitions.map((definition) => definition.name))});
`;
}

function renderCodegenMetadata(definitions) {
  return `${header('DOM and SSR lowering metadata generated from the canonical widget registry.')}\n` +
`export const PRIMITIVE_NATIVE_ELEMENTS: Readonly<Record<string, string>> = Object.freeze({
${definitions.map((definition) => `  ${definition.name}: ${literal(definition.nativeElement)},`).join('\n')}
});

export const PRIMITIVE_CALL_PROPERTIES: Readonly<Record<string, string>> = Object.freeze({
${definitions.filter((definition) => definition.callProperty).map((definition) => `  ${definition.name}: ${literal(definition.callProperty)},`).join('\n')}
});
`;
}

function renderRuntimeMetadata(definitions) {
  return `${header('Runtime widget defaults generated from the canonical widget registry.')}\n` +
`export const WIDGET_DEFAULT_ATTRIBUTES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
${definitions.filter((definition) => Object.keys(definition.defaults).length > 0).map((definition) => `  ${definition.name}: Object.freeze(${literal(definition.defaults)}),`).join('\n')}
});
`;
}

function renderToolingRegistry(definitions) {
  const entries = definitions.map((definition) => ({
    label: definition.name,
    kind: 'widget',
    detail: `VX ${definition.category} primitive · renders <${definition.nativeElement}>`,
    insertText: snippetFor(definition)
  }));
  return `${header('Language tooling completions generated from the canonical widget registry.')}\n` +
`import type { CompletionEntry } from './types.js';

export const WIDGET_COMPLETIONS: readonly CompletionEntry[] = Object.freeze(${literal(entries)});
`;
}

function renderEditorSnippets(definitions) {
  const snippets = {};
  for (const definition of definitions) {
    snippets[`VX ${definition.name} widget`] = {
      prefix: `vx${definition.name.toLowerCase()}`,
      body: [snippetFor(definition)],
      description: `Insert the VX ${definition.name} ${definition.category} primitive`
    };
  }
  return `${JSON.stringify(snippets, null, 2)}\n`;
}

function renderDocumentation(definitions) {
  const rows = definitions.map((definition) => {
    const properties = definition.properties.map((property) => `\`${property.name}: ${property.type}\``).join('<br>') || '—';
    const events = definition.events.map((event) => `\`${event.name}: Event<${event.payloadType}>\``).join('<br>') || '—';
    const content = definition.content.map((region) => `\`${region.name}: ${region.cardinality}\``).join('<br>') || '—';
    return `| \`${definition.name}\` | ${definition.category} | \`<${definition.nativeElement}>\` | ${properties} | ${events} | ${content} |`;
  });
  return `<!-- This file is generated by scripts/widgets/generate-widget-registry.mjs. -->
# Native widget registry

VX ${definitions.length}-widget canonical registry. Public contracts come from primitive \`.vx\` files; lowering and semantic metadata come from \`packages/widgets/registry/widgets.mjs\`. CI rejects missing files, unregistered files, stale generated artifacts, and metadata drift.

| Widget | Category | Native element | Properties | Events | Content regions |
|---|---|---|---|---|---|
${rows.join('\n')}
`;
}

function snippetFor(definition) {
  if (definition.callProperty) return `${definition.name}(\${1:${definition.callProperty}})`;
  if (definition.groups.includes('container')) return `${definition.name} {\n  \${1}\n}`;
  return definition.name;
}

function union(values) {
  return [...new Set(values)].sort().map((value) => literal(value)).join(' | ');
}

function literal(value) {
  return JSON.stringify(value, null, 2).replace(/\n/g, '\n  ').replace(/^  /, '');
}

function header(description) {
  return `/**\n * ${description}\n * DO NOT EDIT: run \`pnpm widgets:generate\`.\n */`;
}

function safeRead(path) {
  try { return normalizeNewlines(readFileSync(path, 'utf8')); } catch { return null; }
}

function safeDirectoryEntries(path) {
  try { return readdirSync(path); } catch { return []; }
}

function normalizeNewlines(value) {
  return value.replace(/\r\n?/g, '\n');
}

function assertEqualLists(left, right, leftName, rightName) {
  const missing = left.filter((item) => !right.includes(item));
  const extra = right.filter((item) => !left.includes(item));
  if (missing.length || extra.length) {
    throw new Error(`${leftName} and ${rightName} differ. Missing source files: ${missing.join(', ') || 'none'}. Unregistered source files: ${extra.join(', ') || 'none'}.`);
  }
}
