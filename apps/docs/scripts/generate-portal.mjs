import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '..', '..');
const pagesRoot = join(appRoot, 'src', 'pages');
const generatedRoot = join(pagesRoot, '_generated');
const manifestPath = join(appRoot, 'src', 'content', 'index.ts');
const entries = [];
const generatedRoutes = new Set();
const COMMON_STYLES = `
  @page { flow: vertical gap: xl inset: hero maxWidth: 1120 marginX: auto width: fill }
  @eyebrow { typography: label.sm color: sapphire-600 }
  @lead { typography: body.xl color: cloud-600 maxWidth: prose }
  @section { flow: vertical gap: md }
  @subsection { flow: vertical gap: sm }
  @codeBlock { flow: vertical gap: xs typography: mono.md surface: code color: cloud-100 corner: lg inset: lg overflow: auto }
  @table { flow: vertical gap: none border: subtle corner: lg overflow: hidden }
  @tableHeader { flow: horizontal gap: md inset: md surface: sapphire-50 typography: label.sm color: sapphire-900 }
  @tableRow { flow: horizontal gap: md inset: md borderTop: subtle typography: body.sm }
  @propertyName { typography: mono.sm color: sapphire-700 minWidth: 14rem }
  @propertyValue { typography: mono.sm color: cloud-700 minWidth: 12rem }
  @propertyDescription { typography: body.sm color: cloud-600 width: fill }
  @list { flow: vertical gap: sm }
  @bullet { typography: body.md color: cloud-700 }
  @callout { flow: vertical gap: sm inset: lg surface: sapphire-50 border: sapphire-200 corner: lg }
  @cards { flow: grid columns: 2 minColumn: 260 gap: md }
  @card { flow: vertical gap: sm inset: lg surface: raised border: subtle corner: lg }
  @cardTitle { typography: heading.md color: sapphire-700 }
  @meta { typography: body.sm color: cloud-500 }
  @chipRow { flow: horizontal gap: sm wrap: true }
  @chip { typography: mono.sm surface: sapphire-50 color: sapphire-800 border: sapphire-200 corner: pill inset: badge }
`;
resetGeneratedAreas();
const widgets = readWidgets();
const visualProperties = readVisualProperties();
const visualRoles = readVisualRoles();
const visualConditions = readVisualConditions();
const packages = readPackages();
writeWidgetMarkdownDocumentation(widgets);
writeWidgetDocumentation(widgets);
writeVisualDocumentation(visualProperties, visualRoles, visualConditions);
writePackageDocumentation(packages);
writeMarkdownCollections();
writeSectionIndexes({ widgets, visualProperties, visualRoles, visualConditions, packages });
writeRootOverview({ widgets, visualProperties, visualRoles, visualConditions, packages });
writeLayout();
writeManifest();
console.log(`Generated VX documentation portal: ${entries.length + countPreservedRoutes()} indexed routes, ${generatedRoutes.size} generated routes.`);
function resetGeneratedAreas() {
  const generatedAreas = [
    'widgets', 'visual', 'packages', 'reference', 'guides', 'cookbook', 'tutorials',
    'internals', 'project', 'security', 'migrations'
  ];
  for (const area of generatedAreas) rmSync(join(pagesRoot, area), { recursive: true, force: true });
  rmSync(generatedRoot, { recursive: true, force: true });
  mkdirSync(generatedRoot, { recursive: true });
}
function readWidgets() {
  const definitionsRoot = join(repositoryRoot, 'packages', 'widgets', 'src', 'generated', 'definitions');
  return readdirSync(definitionsRoot)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => {
      const source = readFileSync(join(definitionsRoot, name), 'utf8');
      const match = source.match(/Object\.freeze\((\{[\s\S]*?\}) as const\)/);
      if (!match) throw new Error(`Unable to parse generated widget definition ${name}.`);
      return JSON.parse(match[1]);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
function readVisualProperties() {
  const source = readFileSync(join(repositoryRoot, 'packages', 'compiler', 'src', 'visual', 'properties.ts'), 'utf8');
  const setBody = source.split('export const SUPPORTED_VISUAL_PROPERTIES = new Set([', 2)[1]?.split(']);', 1)[0];
  if (!setBody) throw new Error('Unable to find SUPPORTED_VISUAL_PROPERTIES.');
  const properties = [];
  let category = 'Miscellaneous';
  for (const line of setBody.split('\n')) {
    const comment = line.match(/^\s*\/\/\s*(.+?)\s*$/);
    if (comment) category = comment[1].replace(/—/g, '-');
    for (const match of line.matchAll(/'([^']+)'/g)) properties.push({ name: match[1], category });
  }
  const switchBody = source.split('switch (property) {', 2)[1]?.split('// ─── Helpers', 1)[0] ?? '';
  const targetMap = new Map();
  let pending = [];
  for (const line of switchBody.split('\n')) {
    const cases = [...line.matchAll(/case\s+'([^']+)'/g)].map((match) => match[1]);
    if (cases.length) pending.push(...cases);
    if (pending.length && line.includes('return')) {
      const targets = [...line.matchAll(/(?:one|oneV)\('([^']+)'/g)].map((match) => match[1]);
      for (const property of pending) targetMap.set(property, targets.length ? [...new Set(targets)] : []);
      pending = [];
    }
  }
  return properties.map((property) => ({ ...property, cssTargets: targetMap.get(property.name) ?? [] }));
}
function readVisualRoles() {
  const source = readFileSync(join(repositoryRoot, 'packages', 'compiler', 'src', 'visual', 'catalog.ts'), 'utf8');
  const marker = 'export const BUILTIN_ROLES: Readonly<Record<string, BuiltinRoleDefinition>> = {';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Unable to find BUILTIN_ROLES.');
  const objectStart = source.indexOf('{', start + marker.length - 1);
  const objectEnd = findMatchingBrace(source, objectStart);
  const objectText = source.slice(objectStart, objectEnd + 1);
  const structural = (properties, arguments_ = {}, extraCss) => ({ category: 'structural', properties, arguments: arguments_, ...(extraCss ? { extraCss } : {}) });
  const semantic = (properties, states = {}, arguments_ = {}) => ({ category: 'semantic', properties, states, arguments: arguments_ });
  const registry = Function('structural', 'semantic', `return (${objectText});`)(structural, semantic);
  return Object.entries(registry).map(([name, definition]) => ({ name, ...definition })).sort((a, b) => a.name.localeCompare(b.name));
}
function readVisualConditions() {
  const source = readFileSync(join(repositoryRoot, 'packages', 'compiler', 'src', 'visual', 'resolver-media.ts'), 'utf8');
  const body = source.split('export const CONDITION_NAMES = new Set([', 2)[1]?.split(']);', 1)[0] ?? '';
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}
function readPackages() {
  const roots = [join(repositoryRoot, 'packages'), join(repositoryRoot, 'apps')];
  const output = [];
  const rootManifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
  output.push(packageRecord(repositoryRoot, rootManifest, 'vx'));
  for (const root of roots) {
    for (const name of readdirSync(root).sort()) {
      const packageRoot = join(root, name);
      const manifestPath = join(packageRoot, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.private) continue;
      output.push(packageRecord(packageRoot, manifest, name));
    }
  }
  return output.sort((a, b) => a.name.localeCompare(b.name));
}
function packageRecord(packageRoot, manifest, folderName) {
  const exports = typeof manifest.exports === 'object' && manifest.exports ? Object.keys(manifest.exports) : [];
  const apiName = folderName === 'vx' ? 'vx' : folderName;
  const apiPath = join(repositoryRoot, 'docs', 'api', `${apiName}.md`);
  return {
    folderName,
    root: packageRoot,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description ?? 'VX framework package.',
    exports,
    apiPath: existsSync(apiPath) ? apiPath : null
  };
}
function writeWidgetMarkdownDocumentation(widgets) {
  const docsRoot = join(repositoryRoot, 'docs', 'widgets');
  const componentsRoot = join(docsRoot, 'components');
  rmSync(componentsRoot, { recursive: true, force: true });
  mkdirSync(componentsRoot, { recursive: true });
  const groups = groupBy(widgets, (widget) => widget.category);
  const index = ['# Native widgets', '', `VX exposes ${widgets.length} canonical native widgets. Contracts are generated from primitive .vx sources and semantic metadata from the canonical registry.`, '', '## Categories', ''];
  for (const [category, members] of [...groups.entries()].sort()) {
    index.push(`### ${titleCase(category)}`, '');
    for (const widget of members) index.push(`- [${widget.name}](./components/${widget.name}.md) — native \`<${widget.nativeElement}>\`, ${widget.properties.length} properties, ${widget.events.length} events.`);
    index.push('');
  }
  index.push('## Contract policy', '', '- Widget names, native elements, properties, events, content regions, defaults, compiler validation, DOM lowering, SSR lowering, tooling metadata, snippets, and this reference derive from the same registry.', '- Unknown properties and events are diagnostics.', '- Client and SSR lowering must preserve the same native element and widget identity.', '- Run `pnpm widgets:generate`, `pnpm widgets:check`, and `pnpm widgets:verify-lowering` after contract changes.', '');
  writeFileSync(join(docsRoot, 'README.md'), index.join('\n'), 'utf8');
  for (const widget of widgets) {
    const lines = [`# ${widget.name}`, '', `${widget.name} is a ${widget.category} widget lowered to \`<${widget.nativeElement}>\` in client and SSR output.`, '', '## Canonical contract', '', '```vx', widget.contractSource.trimEnd(), '```', '', '## Metadata', '', '| Field | Value |', '|---|---|', `| Category | \`${widget.category}\` |`, `| Native element | \`<${widget.nativeElement}>\` |`, `| Call property | ${widget.callProperty ? `\`${widget.callProperty}\`` : 'none'} |`, `| Groups | ${widget.groups.length ? widget.groups.map((value) => `\`${value}\``).join(', ') : 'none'} |`, `| Runtime defaults | ${Object.keys(widget.defaults).length ? `\`${JSON.stringify(widget.defaults)}\`` : 'none'} |`, '', '## Properties', '', '| Name | Type | Default | Required |', '|---|---|---|---|'];
    for (const property of widget.properties.filter((property) => !property.event)) lines.push(`| \`${property.name}\` | \`${property.type}\` | ${property.defaultValue === null ? '—' : `\`${property.defaultValue}\``} | ${property.required ? 'yes' : 'no'} |`);
    if (!widget.properties.some((property) => !property.event)) lines.push('| — | — | — | — |');
    lines.push('', '## Events and outputs', '', '| Name | Payload |', '|---|---|');
    for (const event of widget.events) lines.push(`| \`${event.name}\` | \`${event.payloadType}\` |`);
    if (!widget.events.length) lines.push('| — | — |');
    lines.push('', '## Content regions', '', '| Name | Cardinality | Required |', '|---|---|---|');
    for (const region of widget.content) lines.push(`| \`${region.name}\` | \`${region.cardinality}\` | ${region.required ? 'yes' : 'no'} |`);
    if (!widget.content.length) lines.push('| — | — | — |');
    lines.push('', '## Usage shape', '', '```text', ...widgetExample(widget), '```', '', '## Production guidance', '', ...widgetBestPractices(widget).map((item) => `- ${item}`), ...widgetAccessibilityChecklist(widget).map((item) => `- ${item}`), ...widgetPerformanceChecklist(widget).map((item) => `- ${item}`), '');
    writeFileSync(join(componentsRoot, `${widget.name}.md`), lines.join('\n'), 'utf8');
  }
  const categoryFiles = new Map([
    ['DATA_DISPLAY.md', ['data', 'display', 'text', 'media', 'layout']],
    ['FORMS.md', ['control', 'form']],
    ['NAVIGATION.md', ['navigation', 'composite']],
    ['OVERLAYS.md', ['overlay']],
    ['PROGRESS.md', ['feedback']]
  ]);
  for (const [file, categories] of categoryFiles) {
    const members = widgets.filter((widget) => categories.includes(widget.category));
    const lines = [`# ${titleCase(file.replace('.md', '').replaceAll('_', ' '))}`, '', `This guide groups ${members.length} canonical widgets used for ${categories.join(', ')} scenarios.`, '', '## Widgets', ''];
    for (const widget of members) lines.push(`- [${widget.name}](./components/${widget.name}.md) — \`<${widget.nativeElement}>\`, ${widget.properties.length} properties, ${widget.events.length} events.`);
    lines.push('', '## Guidance', '', '- Start from the native widget contract and compose behavior through typed state, actions, content regions, and Visual roles.', '- Preserve accessible names, keyboard behavior, focus visibility, deterministic SSR output, and stable collection identity.', '- Do not maintain independent property or native-element maps in application code.', '');
    writeFileSync(join(docsRoot, file), lines.join('\n'), 'utf8');
  }
}
function writeWidgetDocumentation(widgets) {
  const groups = groupBy(widgets, (widget) => widget.category);
  const indexBlocks = [];
  for (const [category, members] of [...groups.entries()].sort()) {
    indexBlocks.push(section(titleCase(category), [cards(members.map((widget) => ({
      title: widget.name,
      href: `/widgets/${slug(widget.name)}`,
      description: `${widget.nativeElement} · ${widget.properties.length} properties · ${widget.events.length} events`
    })))]));
  }
  writePage('/widgets', 'Native widget reference', 'REFERENCE', `All ${widgets.length} compiler-known widgets, generated from the canonical registry and current .vx contracts.`, indexBlocks, {
    group: 'widgets', kind: 'index', keywords: ['widgets', 'components', 'contracts']
  });
  for (const widget of widgets) {
    const properties = widget.properties.filter((property) => !property.event);
    const related = widgets.filter((candidate) => candidate.category === widget.category && candidate.name !== widget.name).slice(0, 6);
    const blocks = [
      section('Contract summary', [
        metadataRows([
          ['Category', widget.category],
          ['Native element', `<${widget.nativeElement}>`],
          ['Call property', widget.callProperty ?? 'none'],
          ['Semantic groups', widget.groups.length ? widget.groups.join(', ') : 'none'],
          ['Runtime defaults', Object.keys(widget.defaults).length ? JSON.stringify(widget.defaults) : 'none']
        ])
      ]),
      section('Properties', [propertyRows(properties)]),
      section('Events and outputs', [eventRows(widget.events)]),
      section('Content regions', [contentRows(widget.content)]),
      section('Minimal usage', [codeBlock(widgetExample(widget))]),
      section('Accessibility', [paragraph(widgetAccessibility(widget)), bulletList(widgetAccessibilityChecklist(widget))]),
      section('SSR, hydration, and performance', [paragraph(widgetPerformance(widget)), bulletList(widgetPerformanceChecklist(widget))]),
      section('Best practices', [bulletList(widgetBestPractices(widget))]),
      section('Related widgets', [cards(related.map((candidate) => ({
        title: candidate.name,
        href: `/widgets/${slug(candidate.name)}`,
        description: `${candidate.category} widget lowered to the native ${candidate.nativeElement} element.`
      })))])
    ];
    writePage(`/widgets/${slug(widget.name)}`, widget.name, 'WIDGET REFERENCE', `${widget.name} is a ${widget.category} widget lowered consistently to <${widget.nativeElement}> in client and SSR output.`, blocks, {
      group: 'widgets', kind: 'widget', keywords: [widget.name, widget.category, widget.nativeElement, ...widget.properties.map((property) => property.name)]
    });
  }
}
function writeVisualDocumentation(properties, roles, conditions) {
  const propertyGroups = groupBy(properties, (property) => property.category);
  writePage('/visual', 'Visual system', 'REFERENCE', `The VX Visual IR exposes ${properties.length} validated properties, ${roles.length} built-in roles, and ${conditions.length} state or environment conditions.`, [
    section('Reference areas', [cards([
      { title: 'Visual properties', href: '/visual/properties', description: `${properties.length} compiler-validated properties and their CSS lowering.` },
      { title: 'Built-in roles', href: '/visual/roles', description: `${roles.length} structural and semantic roles.` },
      { title: 'Conditions', href: '/visual/conditions', description: `${conditions.length} interaction and environment conditions.` },
      { title: 'Color system', href: '/project/color-system', description: 'Palettes, semantic tones, surfaces, and contrast rules.' },
      { title: 'Styles architecture', href: '/project/styles-architecture', description: 'Visual IR, scoped styling, critical CSS, and code splitting.' },
      { title: 'Accessibility guide', href: '/guides/accessibility', description: 'Focus, keyboard, contrast, names, and reduced motion.' }
    ])]),
    section('Core model', [
      paragraph('Visual roles express intent. The compiler validates each property, resolves tokens and conditions, rejects unsafe raw values, and emits deterministic scoped CSS.'),
      codeBlock(['#view', '  View @catalog {', '    Text("Products")', '  }', '', '  @catalog uses @grid(min: 18rem, gap: lg) {', '    surface: raised', '    when hover { elevation: sm }', '    when viewport(min: md) { columns: 3 }', '  }', '#end view'])
    ])
  ], { group: 'visual', kind: 'index', keywords: ['visual', 'styles', 'css', 'roles', 'tokens'] });
  const groupCards = [...propertyGroups.entries()].map(([category, members]) => ({
    title: category,
    href: `/visual/properties/category/${slug(category)}`,
    description: `${members.length} properties.`
  }));
  writePage('/visual/properties', 'Visual properties', 'VISUAL REFERENCE', `${properties.length} supported properties. Unknown names and unsafe values produce diagnostics instead of silent CSS drift.`, [
    section('Property groups', [cards(groupCards)]),
    section('All properties', [chipLinks(properties.map((property) => ({ label: property.name, href: `/visual/properties/${slug(property.name)}` })))])
  ], { group: 'visual', kind: 'index', keywords: ['visual properties', 'css mapping'] });
  for (const [category, members] of propertyGroups) {
    writePage(`/visual/properties/category/${slug(category)}`, category, 'VISUAL PROPERTY GROUP', `${members.length} properties in the ${category.toLowerCase()} group.`, [
      section('Properties', [cards(members.map((property) => ({
        title: property.name,
        href: `/visual/properties/${slug(property.name)}`,
        description: property.cssTargets.length ? `CSS: ${property.cssTargets.join(', ')}` : 'Compiler-owned layout helper.'
      })))])
    ], { group: 'visual', kind: 'visual-category', keywords: [category, ...members.map((member) => member.name)] });
  }
  for (const property of properties) {
    const example = visualPropertyExample(property.name);
    const alternatives = properties.filter((candidate) => candidate.category === property.category && candidate.name !== property.name).slice(0, 8);
    writePage(`/visual/properties/${slug(property.name)}`, property.name, 'VISUAL PROPERTY', `${property.name} belongs to ${property.category.toLowerCase()} and is validated before CSS emission.`, [
      section('Lowering contract', [metadataRows([
        ['Property', property.name],
        ['Category', property.category],
        ['CSS target', property.cssTargets.length ? property.cssTargets.join(', ') : 'compiler helper / composite output'],
        ['Safety', 'raw semicolons and braces are rejected'],
        ['Scope', 'local role, composed role, state, media, or container condition']
      ])]),
      section('Syntax', [codeBlock(['#view', '  View @example', '', '  @example {', `    ${property.name}: ${example}`, '  }', '#end view'])]),
      section('States and responsive use', [codeBlock(['@example {', `  ${property.name}: ${example}`, '  when hover {', `    ${property.name}: ${visualAlternateValue(property.name, example)}`, '  }', '  when viewport(min: md) {', `    ${property.name}: ${example}`, '  }', '}'])]),
      section('Value guidance', [paragraph(visualPropertyGuidance(property)), bulletList(visualPropertyChecklist(property))]),
      section('Related properties', [chipLinks(alternatives.map((candidate) => ({ label: candidate.name, href: `/visual/properties/${slug(candidate.name)}` })))])
    ], { group: 'visual', kind: 'visual-property', keywords: [property.name, property.category, ...property.cssTargets] });
  }
  writePage('/visual/roles', 'Built-in visual roles', 'VISUAL REFERENCE', `${roles.length} compiler-owned roles encode reusable structural and semantic intent without creating runtime components.`, [
    section('Structural roles', [cards(roles.filter((role) => role.category === 'structural').map(roleCard))]),
    section('Semantic roles', [cards(roles.filter((role) => role.category === 'semantic').map(roleCard))]),
    section('Composition', [codeBlock(['@productCard uses @card(density: compact) {', '  gap: lg', '  when hover { elevation: md }', '}'])])
  ], { group: 'visual', kind: 'index', keywords: ['roles', 'structural', 'semantic'] });
  for (const role of roles) {
    const args = Object.entries(role.arguments ?? {});
    const states = Object.entries(role.states ?? {});
    writePage(`/visual/roles/${slug(role.name)}`, `@${role.name}`, 'BUILT-IN ROLE', `A ${role.category} Visual IR role with ${Object.keys(role.properties).length} default properties.`, [
      section('Role contract', [metadataRows([
        ['Name', `@${role.name}`],
        ['Category', role.category],
        ['Arguments', args.length ? args.map(([name, target]) => `${name} → ${target}`).join(', ') : 'none'],
        ['States', states.length ? states.map(([name]) => name).join(', ') : 'none'],
        ['Extra CSS', role.extraCss ?? 'none']
      ])]),
      section('Default properties', [keyValueRows(role.properties)]),
      section('State overrides', [stateRows(states)]),
      section('Usage', [codeBlock(roleExample(role))]),
      section('Guidance', [bulletList(roleGuidance(role))])
    ], { group: 'visual', kind: 'visual-role', keywords: [role.name, role.category, ...Object.keys(role.properties), ...args.map(([name]) => name)] });
  }
  writePage('/visual/conditions', 'Visual conditions', 'VISUAL REFERENCE', `${conditions.length} supported interaction states and environment queries.`, [
    section('Interaction conditions', [conditionCards(conditions.filter((name) => ['hover','pressed','focus','focusVisible','disabled','selected','checked','expanded','invalid','loading'].includes(name)))]),
    section('Environment conditions', [conditionCards(conditions.filter((name) => !['hover','pressed','focus','focusVisible','disabled','selected','checked','expanded','invalid','loading'].includes(name)))]),
    section('Examples', [codeBlock(['@control {', '  surface: primary', '  when hover { surface: primaryHover }', '  when focusVisible { outline: focus }', '  when disabled { opacity: disabled }', '  when dark { surface: steel-900 }', '  when viewport(min: lg) { width: dialog }', '  when container(min: md) { columns: 3 }', '}'])])
  ], { group: 'visual', kind: 'visual-conditions', keywords: conditions });
}
function writePackageDocumentation(packages) {
  writePage('/packages', 'Package API reference', 'REFERENCE', `${packages.length} public VX packages, their supported subpath exports, responsibilities, and generated API surfaces.`, [
    section('Public packages', [cards(packages.map((pkg) => ({
      title: pkg.name,
      href: `/packages/${slug(pkg.folderName)}`,
      description: `${pkg.exports.length || 1} export surface${pkg.exports.length === 1 ? '' : 's'} · ${pkg.description}`
    })))])
  ], { group: 'packages', kind: 'index', keywords: packages.map((pkg) => pkg.name) });
  for (const pkg of packages) {
    const blocks = [
      section('Package contract', [metadataRows([
        ['Package', pkg.name],
        ['Version', pkg.version],
        ['Source', relative(repositoryRoot, pkg.root).replaceAll('\\', '/')],
        ['Subpath exports', pkg.exports.length ? pkg.exports.join(', ') : '.'],
        ['Stability', 'follows the unified VX 0.2.0 release line']
      ])]),
      section('Installation', [codeBlock([`pnpm add ${pkg.name}@next`])]),
      section('Public entry points', [chipList(pkg.exports.length ? pkg.exports : ['.'])])
    ];
    if (pkg.apiPath) blocks.push(...markdownToSections(readFileSync(pkg.apiPath, 'utf8'), { skipFirstHeading: true }));
    blocks.push(section('Usage policy', [bulletList([
      'Import only documented root or subpath exports; internal source paths are not compatibility contracts.',
      'Keep package versions aligned with release/version.json and the fixed Changesets group.',
      'Test browser, server, edge, and Node boundaries only where the package declares support.',
      'Treat generated API snapshots and freeze manifests as release gates, not documentation suggestions.'
    ])]));
    writePage(`/packages/${slug(pkg.folderName)}`, pkg.name, 'PACKAGE REFERENCE', pkg.description, blocks, {
      group: 'packages', kind: 'package', keywords: [pkg.name, pkg.folderName, ...pkg.exports]
    });
  }
}
function writeMarkdownCollections() {
  const collections = [
    { source: 'docs/spec', route: '/reference/language', title: 'Language specification', group: 'reference', kind: 'spec' },
    { source: 'docs/guides', route: '/guides', title: 'Production guides', group: 'guides', kind: 'guide' },
    { source: 'docs/cookbook', route: '/cookbook', title: 'Cookbook', group: 'cookbook', kind: 'cookbook' },
    { source: 'docs/tutorials', route: '/tutorials', title: 'Tutorials', group: 'tutorials', kind: 'tutorial' },
    { source: 'docs/framework', route: '/internals', title: 'Framework internals', group: 'internals', kind: 'internal' },
    { source: 'docs/security', route: '/security', title: 'Security documentation', group: 'security', kind: 'security' },
    { source: 'docs/migrations', route: '/migrations', title: 'Migration guides', group: 'migrations', kind: 'migration' }
  ];
  for (const collection of collections) {
    const directory = join(repositoryRoot, collection.source);
    const files = readdirSync(directory).filter((name) => name.endsWith('.md')).sort();
    const cardsData = [];
    for (const name of files) {
      if (name === 'README.md') continue;
      const source = readFileSync(join(directory, name), 'utf8');
      const title = firstHeading(source) ?? titleCase(name.replace(/\.md$/, '').replaceAll('-', ' '));
      const route = `${collection.route}/${slug(name.replace(/\.md$/, ''))}`;
      const description = firstParagraph(source) ?? `${collection.kind} documentation for VX.`;
      cardsData.push({ title, href: route, description });
      writePage(route, title, collection.title.toUpperCase(), description, markdownToSections(source, { skipFirstHeading: true }), {
        group: collection.group, kind: collection.kind, keywords: markdownKeywords(source)
      });
    }
    const readme = existsSync(join(directory, 'README.md')) ? readFileSync(join(directory, 'README.md'), 'utf8') : '';
    const blocks = [];
    if (readme) blocks.push(...markdownToSections(readme, { skipFirstHeading: true }));
    blocks.push(section('Documents', [cards(cardsData)]));
    writePage(collection.route, collection.title, 'DOCUMENTATION', firstParagraph(readme) ?? `Browse ${collection.title.toLowerCase()}.`, blocks, {
      group: collection.group, kind: 'index', keywords: cardsData.map((card) => card.title)
    });
  }
  const rootDocuments = [
    'COLOR_SYSTEM.md', 'COMPATIBILITY.md', 'ENGINEERING-STANDARDS.md', 'MULTI_FRAMEWORK_INTEROP.md',
    'PACKAGE-MANAGER.md', 'PROJECT.md', 'PUBLISHING.md', 'RELEASE.md', 'RFC-PROCESS.md',
    'STABILIZATION.md', 'STANDALONE_WIDGETS.md', 'STYLES_ARCHITECTURE.md', 'SUPPORT-POLICY.md',
    'THREAT-MODEL.md', 'VERSIONING.md', 'VX-1.0-READINESS.md', 'MIGRATING-0.1.md', 'GIT-PUBLISHING.md',
    'NPM-BOOTSTRAP.md'
  ];
  const projectCards = [];
  for (const name of rootDocuments) {
    const path = join(repositoryRoot, 'docs', name);
    if (!existsSync(path)) continue;
    const source = readFileSync(path, 'utf8');
    const route = `/project/${slug(name.replace(/\.md$/, ''))}`;
    const title = firstHeading(source) ?? titleCase(name.replace(/\.md$/, '').replaceAll('-', ' '));
    const description = firstParagraph(source) ?? 'VX project policy and engineering documentation.';
    projectCards.push({ title, href: route, description });
    writePage(route, title, 'PROJECT AND POLICY', description, markdownToSections(source, { skipFirstHeading: true }), {
      group: 'project', kind: 'policy', keywords: markdownKeywords(source)
    });
  }
  writePage('/project', 'Project, policy, and release', 'DOCUMENTATION', 'Engineering standards, release governance, compatibility, security, package management, and roadmap contracts.', [
    section('Project documents', [cards(projectCards)])
  ], { group: 'project', kind: 'index', keywords: projectCards.map((card) => card.title) });
}
function writeSectionIndexes({ widgets, visualProperties, visualRoles, visualConditions, packages }) {
  writePage('/reference', 'Complete reference', 'REFERENCE', 'Canonical language, widgets, Visual IR, package APIs, diagnostics, configuration, and command surfaces.', [
    section('Reference areas', [cards([
      { title: 'Language specification', href: '/reference/language', description: 'Frozen lexical, type, component, routing, server, and interoperability contracts.' },
      { title: 'Widget reference', href: '/widgets', description: `${widgets.length} canonical widgets.` },
      { title: 'Visual reference', href: '/visual', description: `${visualProperties.length} properties, ${visualRoles.length} roles, ${visualConditions.length} conditions.` },
      { title: 'Package APIs', href: '/packages', description: `${packages.length} public packages and subpath exports.` },
      { title: 'CLI commands', href: '/commands', description: 'Project, build, test, package, and release commands.' },
      { title: 'Tooling', href: '/tooling', description: 'Language server, formatter, inspector, HMR, DevTools, and editor integration.' }
    ])])
  ], { group: 'reference', kind: 'index', keywords: ['reference', 'api', 'language', 'widgets', 'visual'] });
  writePage('/learn', 'Learn VX', 'LEARN', 'A progressive path from installation to production delivery.', [
    section('Learning path', [cards([
      { title: 'Getting started', href: '/getting-started', description: 'Install, scaffold, check, run, and build.' },
      { title: 'Project structure', href: '/project-structure', description: 'Routes, components, modules, server code, and configuration.' },
      { title: 'Language basics', href: '/language', description: '#script, #view, types, events, and control flow.' },
      { title: 'Components', href: '/components', description: 'Props, outputs, content regions, parts, and headless modules.' },
      { title: 'State and reactivity', href: '/reactivity', description: 'State, derives, queries, actions, effects, and stores.' },
      { title: 'Views and styling', href: '/views-styling', description: 'Widgets, roles, properties, conditions, and responsive intent.' },
      { title: 'Routing', href: '/routing', description: 'Filesystem routing, layouts, metadata, guards, and SSR.' },
      { title: 'Data and server', href: '/data-server', description: 'Queries, mutations, endpoints, sessions, and authorization.' },
      { title: 'Forms', href: '/forms', description: 'Typed validation, errors, uploads, and progressive enhancement.' },
      { title: 'Testing', href: '/testing', description: 'Unit, component, DOM, SSR, hydration, browser, and budgets.' },
      { title: 'Deployment', href: '/deployment', description: 'Adapters, reproducibility, observability, and rollback.' }
    ])])
  ], { group: 'learn', kind: 'index', keywords: ['learn', 'tutorial', 'getting started'] });
}
function writeRootOverview({ widgets, visualProperties, visualRoles, visualConditions, packages }) {
  writePage('/', 'VX documentation', 'VX 0.2.0', 'Build typed web applications through a compiler-owned language, Visual IR, runtime, router, server, data, forms, package system, and production tooling.', [
    section('Explore the framework', [cards([
      { title: 'Learn VX', href: '/learn', description: 'Follow a progressive path from first page to production.' },
      { title: 'Complete reference', href: '/reference', description: 'Exact contracts for language, widgets, Visual IR, packages, and tools.' },
      { title: 'Production guides', href: '/guides', description: 'Accessibility, performance, security, deployment, packages, and plugins.' },
      { title: 'Cookbook', href: '/cookbook', description: 'Authentication, tables, uploads, optimistic mutations, SEO, realtime, and offline conflicts.' },
      { title: 'Tutorials', href: '/tutorials', description: 'Build routed applications, data flows, and component packages.' },
      { title: 'Framework internals', href: '/internals', description: 'Architecture, rendering, server, data, forms, and official applications.' }
    ])]),
    section('Framework surface', [metadataRows([
      ['Native widgets', String(widgets.length)],
      ['Visual properties', String(visualProperties.length)],
      ['Built-in roles', String(visualRoles.length)],
      ['Visual conditions', String(visualConditions.length)],
      ['Public packages', String(packages.length)],
      ['Canonical domain', 'vx.veelv.site']
    ])]),
    section('Compiler-first workflow', [codeBlock(['corepack enable', 'pnpm install', 'pnpm vx create my-app', 'cd my-app', 'pnpm dev', 'pnpm check', 'pnpm test', 'pnpm build'])]),
    section('Source-driven documentation', [paragraph('Widget pages are generated from the canonical widget registry and .vx contracts. Visual pages are generated from compiler-owned property, role, and condition registries. Package pages combine manifests, subpath exports, and generated API references. CI rejects stale documentation artifacts.')])
  ], { group: 'start', kind: 'home', keywords: ['VX', 'framework', 'documentation'] });
}
function writeLayout() {
  const source = `#script
  content route: required
#end script
#view
  View @site {
    View @topbar {
      View @brandGroup {
        Link("VX") @brandLink { href: "/" }
        Text("Documentation") @brandLabel
        Text("0.2.0") @version
      }
      View @topLinks {
        Link("Learn") { href: "/learn" }
        Link("Reference") { href: "/reference" }
        Link("GitHub") { href: "https://github.com/VX-Foundation/vx" target: "_blank" rel: "noreferrer" }
      }
    }
    View @workspace {
      View @navigation {
        Text("START") @navigationHeading
        Link("Overview") { href: "/" }
        Link("Learn VX") { href: "/learn" }
        Link("Getting started") { href: "/getting-started" }
        Link("Project structure") { href: "/project-structure" }
        Text("BUILD") @navigationHeading
        Link("Language") { href: "/language" }
        Link("Components") { href: "/components" }
        Link("Reactivity") { href: "/reactivity" }
        Link("Views and styling") { href: "/views-styling" }
        Link("Routing") { href: "/routing" }
        Link("Data and server") { href: "/data-server" }
        Link("Forms") { href: "/forms" }
        Text("REFERENCE") @navigationHeading
        Link("Complete reference") { href: "/reference" }
        Link("Language specification") { href: "/reference/language" }
        Link("Widgets") { href: "/widgets" }
        Link("Visual system") { href: "/visual" }
        Link("Packages") { href: "/packages" }
        Link("CLI commands") { href: "/commands" }
        Link("Tooling") { href: "/tooling" }
        Text("PRODUCTION") @navigationHeading
        Link("Guides") { href: "/guides" }
        Link("Cookbook") { href: "/cookbook" }
        Link("Tutorials") { href: "/tutorials" }
        Link("Testing") { href: "/testing" }
        Link("Deployment") { href: "/deployment" }
        Link("Security") { href: "/security" }
        Text("PROJECT") @navigationHeading
        Link("Framework internals") { href: "/internals" }
        Link("Packages and plugins") { href: "/packages-plugins" }
        Link("Project policies") { href: "/project" }
        Link("Migrations") { href: "/migrations" }
        Link("Contributing") { href: "/contributing" }
      }
      View @contentArea { Content(route) }
    }
    View @footer {
      Text("VX 0.2.0 documentation")
      Text("Compiler-first web development by Veelv")
      Link("vx.veelv.site") { href: "https://vx.veelv.site" }
    }
  }
  @site { flow: vertical minHeight: viewport surface: base }
  @topbar { flow: horizontal align: items.center justify: content.between gap: lg inset: lg surface: raised borderBottom: subtle layer: navigation }
  @brandGroup { flow: horizontal align: items.center gap: sm }
  @brandLink { typography: heading.lg color: sapphire-600 decoration: none }
  @brandLabel { typography: body.md color: cloud-700 }
  @version { typography: body.xs surface: sapphire-100 color: sapphire-800 corner: pill inset: badge }
  @topLinks { flow: horizontal align: items.center gap: lg }
  @workspace { sidebar: 19rem gap: none width: fill }
  @navigation { flow: vertical gap: sm inset: lg surface: raised borderRight: subtle minHeight: viewport overflow: auto }
  @navigationHeading { typography: label.sm color: cloud-500 marginTop: lg }
  @contentArea { width: fill minWidth: 0 }
  @footer { flow: horizontal align: items.center justify: content.between gap: lg inset: lg surface: raised borderTop: subtle typography: body.sm color: cloud-500 }
#end view
`;
  writeFile(join(pagesRoot, 'layout.vx'), source);
}
function writeManifest() {
  const preserved = discoverRoutes(pagesRoot).filter((route) => !generatedRoutes.has(route));
  for (const route of preserved) {
    if (entries.some((entry) => entry.route === route)) continue;
    const path = route === '/' ? join(pagesRoot, 'index.vx') : join(pagesRoot, route.slice(1), 'page.vx');
    const source = readFileSync(path, 'utf8');
    entries.push({ route, slug: route === '/' ? '' : route.slice(1), title: firstVxTitle(source) ?? titleCase(route.split('/').at(-1) ?? 'Overview'), description: firstVxLead(source) ?? 'VX documentation.', group: 'learn', kind: 'guide', source: relative(appRoot, path).replaceAll('\\', '/'), keywords: [] });
  }
  entries.sort((a, b) => a.route.localeCompare(b.route));
  const lines = [
    'export type DocumentationKind = \'home\' | \'index\' | \'guide\' | \'widget\' | \'visual-property\' | \'visual-role\' | \'visual-category\' | \'visual-conditions\' | \'package\' | \'spec\' | \'cookbook\' | \'tutorial\' | \'internal\' | \'security\' | \'migration\' | \'policy\';',
    '',
    'export interface DocumentationEntry { route: string; slug: string; title: string; description: string; group: string; kind: DocumentationKind; source: string; keywords: readonly string[]; }',
    '',
    'export const documentationEntries: readonly DocumentationEntry[] = Object.freeze(['
  ];
  for (const entry of entries) lines.push(`  ${JSON.stringify(entry)},`);
  lines.push(']);', '', 'export function findDocumentationEntry(route: string): DocumentationEntry | undefined {', '  return documentationEntries.find((entry) => entry.route === route);', '}', '');
  writeFile(manifestPath, lines.join('\n'));
}
function writePage(route, title, eyebrow, lead, blocks, metadata) {
  const path = route === '/' ? join(pagesRoot, 'index.vx') : join(pagesRoot, route.slice(1), 'page.vx');
  mkdirSync(dirname(path), { recursive: true });
  const body = [];
  body.push('#view', '  View @page {', `    Text(${q(eyebrow)}) @eyebrow`, `    Title(${q(title)})`, `    Text(${q(lead)}) @lead`);
  for (const block of blocks.filter(Boolean)) body.push(...indent(block, 4));
  body.push('  }', COMMON_STYLES.trimEnd(), '#end view', '');
  writeFile(path, body.join('\n'));
  const source = relative(appRoot, path).replaceAll('\\', '/');
  entries.push({ route, slug: route === '/' ? '' : route.slice(1), title, description: lead, group: metadata.group, kind: metadata.kind, source, keywords: [...new Set(metadata.keywords ?? [])] });
  generatedRoutes.add(route);
}
function section(title, blocks) {
  const lines = ['View @section {', `  Title(${q(title)}) { level: 2 }`];
  for (const block of blocks.filter(Boolean)) lines.push(...indent(block, 2));
  lines.push('}');
  return lines;
}
function paragraph(text, role = null) {
  return [`Text(${q(cleanInline(text))})${role ? ` @${role}` : ''}`];
}
function bulletList(items) {
  const lines = ['View @list {'];
  for (const item of items.filter(Boolean)) lines.push(`  Text(${q(`• ${cleanInline(item)}`)}) @bullet`);
  lines.push('}');
  return lines;
}
function codeBlock(lines) {
  if (!Array.isArray(lines)) lines = String(lines).split('\n');
  const output = ['View @codeBlock {'];
  for (const line of lines) output.push(`  Text(${q(line || ' ')})`);
  output.push('}');
  return output;
}
function metadataRows(rows) {
  const lines = ['View @table {', '  View @tableHeader {', '    Text("Field") @propertyName', '    Text("Value") @propertyDescription', '  }'];
  for (const [name, value] of rows) lines.push('  View @tableRow {', `    Text(${q(name)}) @propertyName`, `    Text(${q(String(value))}) @propertyDescription`, '  }');
  lines.push('}');
  return lines;
}
function propertyRows(properties) {
  if (!properties.length) return paragraph('This widget has no configurable properties.');
  const lines = ['View @table {', '  View @tableHeader {', '    Text("Property") @propertyName', '    Text("Type / default") @propertyValue', '    Text("Requirement") @propertyDescription', '  }'];
  for (const property of properties) {
    const value = `${property.type}${property.defaultValue !== null ? ` = ${property.defaultValue}` : ''}`;
    lines.push('  View @tableRow {', `    Text(${q(property.name)}) @propertyName`, `    Text(${q(value)}) @propertyValue`, `    Text(${q(property.required ? 'required' : 'optional')}) @propertyDescription`, '  }');
  }
  lines.push('}');
  return lines;
}
function eventRows(events) {
  if (!events.length) return paragraph('This widget does not expose events or outputs.');
  const lines = ['View @table {', '  View @tableHeader {', '    Text("Event") @propertyName', '    Text("Payload") @propertyValue', '    Text("Use") @propertyDescription', '  }'];
  for (const event of events) lines.push('  View @tableRow {', `    Text(${q(event.name)}) @propertyName`, `    Text(${q(event.payloadType)}) @propertyValue`, `    Text(${q(`Bind with ${event.name} => action().`)}) @propertyDescription`, '  }');
  lines.push('}');
  return lines;
}
function contentRows(content) {
  if (!content.length) return paragraph('This widget does not project content regions.');
  return metadataRows(content.map((region) => [region.name, `${region.cardinality}${region.required ? ' · required' : ' · optional'}`]));
}
function keyValueRows(object) {
  const entries = Object.entries(object ?? {});
  return entries.length ? metadataRows(entries) : paragraph('No default properties.');
}
function stateRows(states) {
  if (!states.length) return paragraph('This role does not define built-in state overrides.');
  const lines = ['View @table {'];
  for (const [state, properties] of states) {
    lines.push('  View @tableRow {', `    Text(${q(state)}) @propertyName`, `    Text(${q(Object.entries(properties).map(([name, value]) => `${name}: ${value}`).join(', '))}) @propertyDescription`, '  }');
  }
  lines.push('}');
  return lines;
}
function chipList(items) {
  const lines = ['View @chipRow {'];
  for (const item of items) lines.push(`  Text(${q(item)}) @chip`);
  lines.push('}');
  return lines;
}
function chipLinks(items) {
  const lines = ['View @chipRow {'];
  for (const item of items) lines.push(`  Link(${q(item.label)}) @chip { href: ${q(item.href)} }`);
  lines.push('}');
  return lines;
}
function cards(items) {
  if (!items.length) return paragraph('No entries are currently available.');
  const lines = ['View @cards {'];
  for (const item of items) lines.push('  View @card {', `    Link(${q(item.title)}) @cardTitle { href: ${q(item.href)} }`, `    Text(${q(cleanInline(item.description))}) @meta`, '  }');
  lines.push('}');
  return lines;
}
function conditionCards(conditions) {
  return cards(conditions.map((name) => ({ title: name, href: '/visual/conditions', description: conditionDescription(name) })));
}
function roleCard(role) {
  return { title: `@${role.name}`, href: `/visual/roles/${slug(role.name)}`, description: `${Object.keys(role.properties).length} defaults · ${Object.keys(role.states ?? {}).length} states · ${Object.keys(role.arguments ?? {}).length} arguments` };
}
function widgetExample(widget) {
  const lines = ['#view'];
  const required = widget.properties.filter((property) => !property.event && property.required && property.defaultValue === null);
  const call = widget.callProperty ? `${widget.name}(${sampleValue(widget.callProperty, widget.properties.find((property) => property.name === widget.callProperty)?.type)})` : widget.name;
  if (required.length || widget.content.length) {
    lines.push(`  ${call} {`);
    for (const property of required.filter((property) => property.name !== widget.callProperty)) lines.push(`    ${property.name}: ${sampleValue(property.name, property.type)}`);
    if (widget.content.length) lines.push('    Text("Projected content")');
    lines.push('  }');
  } else lines.push(`  ${call}`);
  lines.push('#end view');
  return lines;
}
function sampleValue(name, type = 'String') {
  const names = {
    src: '"/media/example.png"', href: '"/account"', title: '"Example"', label: '"Continue"', text: '"Example"',
    name: '"field"', separator: '"/"', contentText: '"Helpful context"', position: '"top"', message: '"Operation completed"',
    variant: '"info"', class: '""', accept: '"image/*"', size: '"medium"', width: '"320"', height: '"180"',
    activeTab: '"overview"', side: '"right"', itemHeight: '48', value: type.includes('Float') ? '50.0' : type.includes('Int') ? '1' : '"value"',
    max: '100.0', open: 'true', expanded: 'true', visible: 'true', closeable: 'true', controller: 'form', options: '[]', items: '[]'
  };
  if (names[name]) return names[name];
  if (type.includes('Bool')) return 'true';
  if (type.includes('Float')) return '1.0';
  if (type.includes('Int')) return '1';
  if (type.includes('List')) return '[]';
  if (type.includes('Any')) return 'value';
  return `"${titleCase(name)}"`;
}
function widgetAccessibility(widget) {
  const byCategory = {
    control: 'Controls must expose a visible or programmatic label, keyboard behavior, disabled state, validation state, and predictable focus order.',
    overlay: 'Overlays require focus containment, an accessible name, Escape behavior where closeable, focus restoration, and background interaction management.',
    navigation: 'Navigation widgets must preserve native semantics, current state, keyboard traversal, and meaningful destination labels.',
    media: 'Media widgets require alternatives, captions or transcripts where applicable, user-controlled playback, and explicit trust boundaries for embeds.',
    feedback: 'Feedback must expose status through appropriate live-region semantics without stealing focus or announcing duplicate messages.',
    form: 'Form containers coordinate labels, descriptions, validation summaries, submission state, and server-owned error identity.',
    data: 'Data widgets must preserve reading order, row or item identity, keyboard access where interactive, and an accessible empty state.',
    text: 'Text widgets must preserve semantic hierarchy, readable contrast, zoom behavior, and selectable content when users need to copy it.',
    layout: 'Layout widgets must not replace semantic landmarks; use native content widgets and explicit accessible roles for meaning.',
    display: 'Display widgets must avoid conveying critical meaning through color or imagery alone.',
    composite: 'Composite widgets require a complete keyboard model, expanded state, focus visibility, and stable content identity.'
  };
  return byCategory[widget.category] ?? 'Preserve native semantics, accessible names, keyboard behavior, focus visibility, and sufficient contrast.';
}
function widgetAccessibilityChecklist(widget) {
  const base = ['Provide a meaningful accessible name.', 'Verify keyboard-only operation and visible focus.', 'Test invalid, disabled, loading, and empty states where supported.'];
  if (widget.nativeElement === 'img') base.push('Use alt text for informative images and decorative: true only for decoration.');
  if (widget.nativeElement === 'iframe') base.push('Provide title and explicit sandbox or trusted policy.');
  if (widget.category === 'overlay') base.push('Restore focus to the invoker after closing.');
  return base;
}
function widgetPerformance(widget) {
  if (widget.name === 'VirtualList') return 'VirtualList bounds rendered work for large collections. Stable item identity and measured item height are required to prevent scroll jumps.';
  if (widget.name === 'DataTable' || widget.name === 'List') return 'Keep row or item identity stable, paginate or virtualize large datasets, and avoid rebuilding derived collections during every render.';
  if (widget.category === 'media') return 'Declare intrinsic dimensions, choose suitable preload behavior, and avoid hydrating media controls unless interaction requires it.';
  if (widget.category === 'overlay') return 'Render overlays only when required, keep portal ownership deterministic, and dispose listeners, focus scopes, and scroll locks on removal.';
  return `The compiler lowers ${widget.name} to the same native element for client and SSR. Hydrate only when events, state, or lifecycle behavior require client ownership.`;
}
function widgetPerformanceChecklist(widget) {
  const list = ['Keep property values deterministic between server and client.', 'Avoid unnecessary client hydration for static output.', 'Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.'];
  if (widget.groups.includes('container')) list.push('Use keyed children when collection identity matters.');
  if (widget.groups.includes('formControl')) list.push('Keep server validation authoritative and reconcile field errors by stable field name.');
  return list;
}
function widgetBestPractices(widget) {
  return [
    `Prefer ${widget.name} over recreating its <${widget.nativeElement}> contract through an untyped wrapper.`,
    'Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.',
    'Bind only documented properties and events; unknown inputs are compiler diagnostics.',
    'Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.'
  ];
}
function visualPropertyExample(name) {
  const exact = {
    display:'grid', flow:'horizontal', reverse:'true', wrap:'true', gap:'md', space:'lg', items:'center', content:'between', place:'center',
    flexGrow:'1', flexShrink:'0', order:'1', basis:'18rem', columns:'3', minColumn:'18rem', dense:'true', autoColumns:'1fr', autoRows:'auto', autoFlow:'row',
    gridRows:'auto 1fr', gridAreas:'"header header" "sidebar main"', gridColumn:'span 2', gridRow:'span 1', gridArea:'main',
    width:'fill', height:'auto', minWidth:'16rem', minHeight:'viewport', maxWidth:'prose', maxHeight:'32rem', inset:'lg', insetX:'md', insetY:'lg', margin:'md', marginX:'auto', marginY:'lg',
    position:'relative', top:'0', right:'0', bottom:'0', left:'0', stack:'true', typography:'body.md', size:'1rem', weight:'600', lineHeight:'1.5', textAlign:'center', decoration:'underlineOnHover', letterSpacing:'0.02em', wordSpacing:'0.1em', textTransform:'uppercase', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'system', fontStyle:'italic', fontVariant:'small-caps', hyphens:'auto',
    surface:'raised', tone:'body', accentColor:'sapphire-600', colorScheme:'light dark', caretColor:'sapphire-600', corner:'lg', border:'subtle', borderTop:'subtle', borderRight:'subtle', borderBottom:'subtle', borderLeft:'subtle', borderColor:'sapphire-200', borderStyle:'solid', borderWidth:'1px', outline:'focus', outlineOffset:'2px', ring:'focus',
    elevation:'md', opacity:'muted', z:'overlay', shadow:'md', blur:'4px', brightness:'1.05', contrast:'1.1', saturate:'1.1', grayscale:'0.25', sepia:'0.2', invert:'0', hueRotate:'15deg', backdropBlur:'8px', backdropBrightness:'0.9', backdropContrast:'1.1', backdropSaturate:'1.2', filter:'blur(2px)', backdropFilter:'blur(8px)',
    background:'linear-gradient(135deg, #fff, #eef)', backgroundImage:'url("/media/hero.webp")', backgroundSize:'cover', backgroundPosition:'center', backgroundRepeat:'no-repeat', backgroundAttachment:'scroll', backgroundClip:'padding-box', backgroundOrigin:'border-box', backgroundBlend:'multiply', gradient:'linear(sapphire-500, violet-500)',
    mask:'linear-gradient(black, transparent)', maskSize:'cover', maskPosition:'center', maskRepeat:'no-repeat', clip:'rect(0 100% 100% 0)', clipPath:'circle(50%)',
    transform:'translateY(-2px)', transformOrigin:'center', perspective:'1000px', perspectiveOrigin:'center', backfaceVisibility:'hidden', rotate:'3deg', scale:'1.02', translate:'0 -2px', skew:'1deg',
    transition:'surface 160ms easeOut', motion:'fade', animation:'pulse 1s ease infinite', animationName:'pulse', animationDuration:'240ms', animationEasing:'easeOut', animationDelay:'0ms', animationFill:'both', animationIterations:'1', animationDirection:'normal', animationPlay:'running',
    scrollAxis:'vertical', snap:'mandatory', snapAlign:'start', snapStop:'always', overscroll:'contain', scrollBehavior:'smooth', scrollPadding:'md', scrollMargin:'md', overflow:'auto', overflowX:'auto', overflowY:'hidden', containerType:'inline-size', containerName:'catalog', contain:'layout style', isolation:'isolate', sidebar:'18rem', side:'left', split:'1 2', collapse:'md', control:'primary', controlSize:'md', density:'comfortable', aspect:'16/9', objectFit:'cover', objectPosition:'center', cursor:'pointer', pointerEvents:'auto', touchAction:'pan-y', userSelect:'none', resize:'vertical', visibility:'visible', direction:'ltr', writingMode:'horizontal-tb', textOrientation:'mixed', layer:'overlay', overlayBehavior:'modal', scrollbar:'thin', center:'true', cluster:'true'
  };
  return exact[name] ?? 'auto';
}
function visualAlternateValue(name, current) {
  const alternates = { surface:'highlighted', tone:'strong', opacity:'full', elevation:'lg', scale:'1.03', translate:'0 -1px', columns:'4', gap:'lg', width:'fill', visibility:'hidden', cursor:'default' };
  return alternates[name] ?? current;
}
function visualPropertyGuidance(property) {
  const category = property.category.toLowerCase();
  if (category.includes('typography')) return 'Prefer semantic typography tokens for hierarchy and reserve raw values for tightly scoped exceptions. Text must remain readable under zoom, user font settings, and high-contrast modes.';
  if (category.includes('color') || category.includes('border') || category.includes('background')) return 'Prefer palette and semantic tokens so dark mode, contrast, themes, and design-system overrides remain coherent.';
  if (category.includes('animation') || category.includes('transform') || category.includes('effects')) return 'Motion and effects must respect reduced-motion preferences, avoid layout thrashing, and preserve content legibility.';
  if (category.includes('layout') || category.includes('sizing') || category.includes('position')) return 'Use compiler-owned layout intent and responsive or container conditions instead of hard-coding viewport-specific structures.';
  return `Use ${property.name} through a local or composed role. The compiler maps it to ${property.cssTargets.length ? property.cssTargets.join(', ') : 'a composite visual helper'} and rejects unsafe raw CSS fragments.`;
}
function visualPropertyChecklist(property) {
  const items = ['Use a documented token or safe CSS value.', 'Verify dark, light, forced-color, and reduced-motion behavior when relevant.', 'Keep server and client design-system inputs identical to avoid hydration drift.'];
  if (property.category.toLowerCase().includes('scroll')) items.push('Test keyboard, touch, focus visibility, and scroll restoration.');
  if (property.category.toLowerCase().includes('animation')) items.push('Provide a reduced-motion fallback.');
  return items;
}
function roleExample(role) {
  const args = Object.entries(role.arguments ?? {}).slice(0, 2).map(([name, target]) => `${name}: ${visualPropertyExample(target)}`);
  const use = args.length ? `@${role.name}(${args.join(', ')})` : `@${role.name}`;
  return ['#view', `  View ${use} {`, '    Text("Content")', '  }', '#end view'];
}
function roleGuidance(role) {
  const items = [
    `Use @${role.name} when its ${role.category} intent matches the UI, not merely because its current CSS looks convenient.`,
    'Override only the properties that differ; keep defaults centralized in the compiler-owned catalog.',
    'Compose local roles with uses instead of copying the full role definition.',
    'Test built-in states and design-system overrides before creating a replacement role.'
  ];
  if (role.extraCss) items.push('This role emits additional scoped CSS; verify child identity and generated selector behavior.');
  return items;
}
function conditionDescription(name) {
  const descriptions = {
    hover:'Pointer hover state.', pressed:'Active or pressed state.', focus:'Focused element.', focusVisible:'Keyboard-relevant visible focus.', disabled:'Native or ARIA disabled state.', selected:'Selected item state.', checked:'Checked control state.', expanded:'Expanded disclosure state.', invalid:'Native or ARIA invalid state.', loading:'Busy or loading state.', dark:'Dark color-scheme preference.', light:'Light color-scheme preference.', motion:'Reduced-motion or no-preference query.', viewport:'Viewport width query with min or max.', container:'Container width query with min or max.', orientation:'Portrait or landscape query.', contrast:'User contrast preference.', pointer:'Pointer precision query.', print:'Print media.', screen:'Screen media.', hoverNone:'Devices without hover.', coarsePointer:'Coarse pointer devices.', forced:'Forced-colors mode.', hdr:'High dynamic-range displays.', reducedData:'Reduced-data preference.'
  };
  return descriptions[name] ?? 'Compiler-supported visual condition.';
}
function markdownToSections(source, { skipFirstHeading = false } = {}) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const output = [];
  let sectionTitle = 'Overview';
  let sectionBlocks = [];
  let paragraphLines = [];
  let inCode = false;
  let codeLines = [];
  let listItems = [];
  let skippedFirst = !skipFirstHeading;
  const flushList = () => {
    if (!listItems.length) return;
    sectionBlocks.push(bulletList(listItems));
    listItems = [];
  };
  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    sectionBlocks.push(paragraph(paragraphLines.join(' ')));
    paragraphLines = [];
  };
  const flushSection = () => {
    flushParagraph();
    flushList();
    if (sectionBlocks.length) output.push(section(sectionTitle, sectionBlocks));
    sectionBlocks = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      if (!inCode) { inCode = true; codeLines = []; }
      else { sectionBlocks.push(codeBlock(codeLines)); inCode = false; codeLines = []; }
      continue;
    }
    if (inCode) { codeLines.push(rawLine); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = cleanInline(heading[2]);
      if (level === 1 && !skippedFirst) { skippedFirst = true; continue; }
      if (level <= 2) { flushSection(); sectionTitle = text; }
      else sectionBlocks.push([`Title(${q(text)}) { level: 3 }`]);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      listItems.push(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''));
      continue;
    }
    if (line.startsWith('>')) {
      flushParagraph();
      flushList();
      sectionBlocks.push(['View @callout {', `  Text(${q(cleanInline(line.replace(/^>\s?/, '')))})`, '}']);
      continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      flushParagraph();
      flushList();
      if (/^\|?\s*:?-+/.test(line)) continue;
      const cells = line.slice(1, -1).split('|').map((cell) => cleanInline(cell.trim())).filter(Boolean);
      sectionBlocks.push(['View @tableRow {', `  Text(${q(cells.join(' · '))}) @propertyDescription`, '}']);
      continue;
    }
    if (/^---+$/.test(line.trim())) { flushParagraph(); flushList(); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    paragraphLines.push(line.trim());
  }
  if (inCode) sectionBlocks.push(codeBlock(codeLines));
  flushList();
  flushSection();
  return output;
}
function firstHeading(source) {
  return source.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}
function firstParagraph(source) {
  const withoutCode = source.replace(/```[\s\S]*?```/g, '');
  const paragraphs = withoutCode.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  for (const value of paragraphs) {
    if (value.startsWith('#') || value.startsWith('|') || value.startsWith('-') || value.startsWith('>')) continue;
    return cleanInline(value.replaceAll('\n', ' '));
  }
  return null;
}
function markdownKeywords(source) {
  const headings = [...source.matchAll(/^#{1,4}\s+(.+)$/gm)].map((match) => cleanInline(match[1]));
  const codeTerms = [...source.matchAll(/`([A-Za-z@#][A-Za-z0-9@#./:_-]+)`/g)].map((match) => match[1]);
  return [...new Set([...headings, ...codeTerms])].slice(0, 80);
}
function cleanInline(value) {
  return String(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function firstVxTitle(source) {
  return source.match(/\bTitle\("((?:\\.|[^"])*)"\)/)?.[1]?.replaceAll('\\"', '"') ?? null;
}
function firstVxLead(source) {
  return source.match(/\bText\("((?:\\.|[^"])*)"\)\s+@lead/)?.[1]?.replaceAll('\\"', '"') ?? null;
}
function discoverRoutes(directory) {
  const result = [];
  for (const file of collectFiles(directory, '.vx')) {
    const rel = relative(directory, file).replaceAll('\\', '/');
    if (rel === 'index.vx') result.push('/');
    else if (rel.endsWith('/page.vx')) result.push(`/${rel.slice(0, -'/page.vx'.length)}`);
  }
  return result;
}
function countPreservedRoutes() {
  return discoverRoutes(pagesRoot).filter((route) => !generatedRoutes.has(route)).length;
}
function collectFiles(directory, extension) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) result.push(...collectFiles(path, extension));
    else if (path.endsWith(extension)) result.push(path);
  }
  return result.sort();
}
function findMatchingBrace(source, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('Unbalanced object literal.');
}
function groupBy(items, selector) {
  const groups = new Map();
  for (const item of items) {
    const key = selector(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}
function titleCase(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function slug(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}
function q(value) {
  return JSON.stringify(String(value).replaceAll('{{', '{ {').replaceAll('}}', '} }'));
}
function indent(lines, spaces) {
  const prefix = ' '.repeat(spaces);
  return lines.map((line) => line ? prefix + line : line);
}
function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}
