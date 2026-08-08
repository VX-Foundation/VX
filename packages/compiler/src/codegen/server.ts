import type {
  ComponentContract,
  DataProgramIR,
  QueryPolicyIR,
  ScriptBlockNode,
  ViewBlockNode,
  ViewNode,
  VisualProgramIR,
  VisualResolvedNode,
  WidgetNode
} from '@vx-foundation/types';
import type { ComponentCodegenContext, ComponentCodegenImport } from '../components/codegen-context.js';
import { componentImport, contentOutletName, isRuntimeDeclaration } from './component-module.js';
import { bodyContainsAwait, lowerBody, lowerExpression, type JavaScriptBinding } from './javascript.js';
import { expandInterpolatedExpression } from '../interpolation.js';
import { normalizeVisualExpression } from '../visual/expression.js';
import { emitClientForms, emitSchemas, emitServerFormHandlers } from '../forms/codegen.js';
import { FORM_CONTROL_WIDGETS } from '../components/validation-constants.generated.js';
import { PRIMITIVE_CALL_PROPERTIES, PRIMITIVE_NATIVE_ELEMENTS } from './primitive-metadata.generated.js';

interface ServerSymbols {
  plain: Set<string>;
}

type ViewBindings = Readonly<Record<string, JavaScriptBinding>>;

/** Emits request-scoped server actions, setup, component rendering, and hydration metadata. */
export function generateServerCode(
  scriptBlock: ScriptBlockNode | undefined,
  viewBlock: ViewBlockNode | undefined,
  data: DataProgramIR,
  visual: VisualProgramIR | undefined,
  component: ComponentCodegenContext | undefined
): string {
  const imports = generateServerImports(component);
  const symbols = collectServerSymbols(scriptBlock, component);
  let code = imports.code;
  if (data.schemas.length || data.forms.length) code += `import { schema, createForm } from '@vx-foundation/forms';\nimport { registerServerForm, serverFormAttributes, serverFieldAttributes, serverFieldErrorAttributes, renderCsrfField, renderMethodOverride, renderErrorSummary } from '@vx-foundation/forms/server';\n`;
  code += `import { registerServerAction, renderText, renderElement, renderComment, renderIsland, renderContent, renderCollection, renderStructuralRange, selectPatternBranch, acquireStore, createComponentScope, provideComponentContext, acquireComponentContext, disposeComponentScope, createCleanupStack, disposeCleanupStack } from '@vx-foundation/runtime/server';\n\n`;
  code += generateActions(scriptBlock, component);
  code += emitSchemas(data.schemas, new Map());
  code += emitServerFormHandlers(data.forms, component?.contract.id ?? 'component');
  code += generateServerSetup(scriptBlock, data, symbols, component, imports.headlessFactories, imports.componentRenderers);

  if (component?.moduleKind === 'headless') {
    code += generateServerHeadlessFactory(component.contract);
    return code;
  }

  const emitter = new ServerViewEmitter(symbols, visual, component, imports.componentRenderers);
  code += `async function __vxRenderView(ctx, context, content = {}) {\n`;
  code += `  let html = '';\n`;
  for (const node of viewBlock?.children ?? []) emitter.walk(node, 'html', 1, 'ctx', 'context', 'content', {});
  code += emitter.code;
  code += `  return html;\n}\n\n`;

  const moduleId = component?.contract.id ?? 'vx-component';
  const interactive = isInteractive(scriptBlock, viewBlock, component);
  code += `export const __vxComponent = Object.freeze({ id: ${JSON.stringify(moduleId)}, interactive: ${String(interactive)} });\n`;
  code += `export async function renderComponent(props = {}, context, content = {}, parentScope = null, forwarded = {}) {\n`;
  code += `  if (!context) throw new TypeError('VX server rendering requires a ServerRenderContext.');\n`;
  code += `  const ctx = await setupServer(props, context, content, parentScope, forwarded);\n`;
  code += `  const html = await __vxRenderView(ctx, context, content);\n`;
  if (interactive) {
    code += `  return context.hydration === 'islands' ? renderIsland(context, ${JSON.stringify(moduleId)}, props, html) : html;\n`;
  } else {
    code += `  return html;\n`;
  }
  code += `}\n`;
  return code;
}

interface GeneratedServerImports {
  code: string;
  componentRenderers: ReadonlyMap<string, string>;
  headlessFactories: ReadonlyMap<string, string>;
}

function generateServerImports(component: ComponentCodegenContext | undefined): GeneratedServerImports {
  const lines: string[] = [];
  const componentRenderers = new Map<string, string>();
  const headlessFactories = new Map<string, string>();
  let componentIndex = 0;
  let headlessIndex = 0;
  const seen = new Set<string>();
  for (const imported of component?.imports ?? []) {
    if (seen.has(imported.moduleId)) continue;
    seen.add(imported.moduleId);
    if (imported.moduleKind === 'component') {
      const local = `__vxRenderComponent_${componentIndex++}`;
      componentRenderers.set(imported.moduleId, local);
      lines.push(`import { renderComponent as ${local} } from ${JSON.stringify(imported.specifier)};`);
    } else {
      const local = `__vxCreateServerHeadless_${headlessIndex++}`;
      headlessFactories.set(imported.moduleId, local);
      lines.push(`import { createServerHeadlessModule as ${local} } from ${JSON.stringify(imported.specifier)};`);
    }
  }
  return { code: lines.length ? `${lines.join('\n')}\n` : '', componentRenderers, headlessFactories };
}

function generateActions(scriptBlock: ScriptBlockNode | undefined, component: ComponentCodegenContext | undefined): string {
  let code = '';
  const bindings = createServerBindings(collectServerSymbols(scriptBlock, component));
  for (const statement of scriptBlock?.statements ?? []) {
    if (statement.side !== 'server' || statement.kind !== 'ActionDeclaration') continue;
    const parameters = statement.parameters.map((parameter) => parameter.name);
    const body = lowerBody(statement.body, { bindings, locals: parameters });
    const asyncKeyword = bodyContainsAwait(statement.body) ? 'async ' : '';
    const contract = {
      id: `${component?.contract.id ?? 'component'}:${statement.name}`,
      name: statement.name,
      parameters: statement.parameters.map((parameter) => ({
        name: parameter.name,
        ...(parameter.typeAnnotation ? { type: parameter.typeAnnotation.text } : {}),
        optional: parameter.optional ?? false
      })),
      ...(statement.returnType ? { returnType: statement.returnType.text } : {}),
      authorization: 'authenticated',
      csrf: 'required'
    };
    code += `export const ${statement.name} = registerServerAction(${JSON.stringify(contract)}, ${asyncKeyword}(${parameters.join(', ')}) => {\n`;
    code += `${indent(body, 2)}\n`;
    code += `});\n\n`;
  }
  return code;
}

function generateServerSetup(
  scriptBlock: ScriptBlockNode | undefined,
  data: DataProgramIR,
  symbols: ServerSymbols,
  component: ComponentCodegenContext | undefined,
  headlessFactories: ReadonlyMap<string, string>,
  componentRenderers: ReadonlyMap<string, string>
): string {
  const bindings = createServerBindings(symbols);
  const queryPolicies = new Map(data.queries.map((query) => [query.name, query.policy]));
  let code = `export async function setupServer(props = {}, context, content = {}, parentScope = null, forwarded = {}) {\n`;
  code += `  const __vxCleanup = createCleanupStack(${JSON.stringify(component?.contract.id ?? 'server-component')});\n`;
  code += `  const __vxComponentScope = createComponentScope(parentScope);\n`;
  code += `  __vxCleanup.push(() => disposeComponentScope(__vxComponentScope));\n`;
  code += `  let __vxDisposed = false;\n`;
  code += `  const __vxDispose = () => {\n`;
  code += `    if (__vxDisposed) return;\n`;
  code += `    __vxDisposed = true;\n`;
  code += `    disposeCleanupStack(__vxCleanup);\n`;
  code += `  };\n`;
  code += `  context.onCleanup(__vxDispose);\n`;
  code += `  const __vxPending = [];\n`;
  code += `  const __vxOwner = ${JSON.stringify(component?.contract.id ?? 'component')};\n`;
  if (component?.moduleKind === 'component') code += `  const Self = renderComponent;\n`;

  const headlessInstances = new Map<string, string>();
  let headlessIndex = 0;
  for (const imported of component?.imports ?? []) {
    if (imported.moduleKind !== 'headless' || headlessInstances.has(imported.moduleId)) continue;
    const factory = headlessFactories.get(imported.moduleId);
    if (!factory) continue;
    const instance = `__vxHeadless_${headlessIndex++}`;
    headlessInstances.set(imported.moduleId, instance);
    code += `  const ${instance} = await ${factory}(context);\n`;
    code += `  __vxCleanup.push(() => ${instance}.dispose());\n`;
  }
  for (const imported of component?.imports ?? []) {
    if (imported.moduleKind !== 'headless' || imported.imported === 'default') continue;
    const instance = headlessInstances.get(imported.moduleId);
    if (instance) code += `  const ${imported.local} = ${instance}.exports[${JSON.stringify(imported.imported)}];\n`;
  }

  for (const imported of component?.imports ?? []) {
    if (imported.moduleKind !== 'component' || imported.imported !== 'default') continue;
    const renderer = componentRenderers.get(imported.moduleId);
    if (renderer) code += `  const ${imported.local} = ${renderer};
`;
  }

  let storeIndex = 0;
  for (const statement of scriptBlock?.statements ?? []) {
    if (!isRuntimeDeclaration(statement)) continue;
    switch (statement.kind) {
      case 'PropDeclaration': {
        const fallback = statement.defaultValue ? lowerExpression(statement.defaultValue.text, { bindings }) : 'undefined';
        code += `  const ${statement.name} = Object.prototype.hasOwnProperty.call(props, ${JSON.stringify(statement.name)}) ? props[${JSON.stringify(statement.name)}] : ${fallback};\n`;
        break;
      }
      case 'ModelDeclarationNode': {
        const fallback = lowerExpression(statement.defaultValue.text, { bindings });
        code += `  const ${statement.name} = Object.prototype.hasOwnProperty.call(props, ${JSON.stringify(statement.name)}) ? props[${JSON.stringify(statement.name)}] : ${fallback};
`;
        break;
      }
      case 'ContextInjectDeclaration': {
        const lease = `__vxContextLease_${statement.name}`;
        const fallback = statement.fallback ? `() => ${lowerExpression(statement.fallback.text, { bindings })}` : 'undefined';
        code += `  const ${lease} = acquireComponentContext(__vxComponentScope.parent, ${JSON.stringify(statement.name)}, ${fallback}, ${String(!statement.fallback)});
`;
        code += `  const ${statement.name} = ${lease}.value.value;
`;
        code += `  __vxCleanup.push(() => ${lease}.release());
`;
        break;
      }
      case 'ContextProvideDeclaration':
        code += `  provideComponentContext(__vxComponentScope, ${JSON.stringify(statement.name)}, ${lowerExpression(statement.expression.text, { bindings })});
`;
        break;
      case 'ConstDeclaration':
        code += `  const ${statement.name} = ${lowerExpression(statement.initializer.text, { bindings })};\n`;
        break;
      case 'StateDeclaration':
        code += `  let ${statement.name} = ${lowerExpression(statement.initializer.text, { bindings })};\n`;
        break;
      case 'DeriveDeclaration':
        code += `  const ${statement.name} = ${lowerExpression(statement.expression.text, { bindings })};\n`;
        break;
      case 'FormDeclaration': {
        code += emitClientForms(data.forms.filter((form) => form.name === statement.name), bindings, '  ', component?.contract.id ?? 'component', 'context.formStates');
        break;
      }
      case 'QueryDeclaration': {
        const source = lowerExpression(statement.source.text, { bindings });
        const inputs = statement.arguments.map((argument) => `${JSON.stringify(argument.name)}: ${lowerExpression(argument.expression.text, { bindings })}`).join(', ');
        const queryPolicy = queryPolicies.get(statement.name);
        const policy = emitQueryPolicy(queryPolicy);
        const enabled = queryPolicy?.enabled ? `, enabled: () => ${lowerExpression(queryPolicy.enabled.text, { bindings })}` : '';
        const tags = queryPolicy?.tags.length ? `, tags: ${JSON.stringify(queryPolicy.tags)}` : '';
        code += `  const ${statement.name} = context.query({ name: ${JSON.stringify(statement.name)}, source: (__vxInput, __vxQuery) => (${source})(__vxInput, __vxQuery), input: () => ({ ${inputs} }), policy: ${policy}${enabled}${tags} }, { ${inputs} });\n`;
        code += `  if (${statement.name}.pending) __vxPending.push(${statement.name}.pending.catch(() => undefined));\n`;
        break;
      }
      case 'StoreDeclaration': {
        const lease = `__vxStoreLease_${storeIndex++}`;
        code += `  const ${lease} = acquireStore(context.runtime.stores, ${JSON.stringify(statement.from)}, ${JSON.stringify(statement.lifetime)}, __vxOwner);\n`;
        code += `  const ${statement.name} = ${lease}.value;\n`;
        code += `  __vxCleanup.push(() => ${lease}.release());\n`;
        break;
      }
      case 'ActionDeclaration':
        if (statement.side === 'server') code += `  const ${statement.name} = (...args) => { throw new Error('Server action ${statement.name} cannot execute during SSR rendering.'); };\n`;
        else code += `  const ${statement.name} = () => undefined;\n`;
        break;
      case 'ImportDeclaration':
      case 'OutputDeclaration':
      case 'ContentDeclaration':
      case 'VisualPartDeclaration':
      case 'GenericDeclaration':
      case 'SchemaDeclaration':
      case 'ForwardDeclaration':
      case 'EffectDeclaration':
      case 'LifecycleDirective':
        break;
    }
  }
  code += `  if (context.streaming === 'blocking' && __vxPending.length > 0) await Promise.all(__vxPending);\n`;
  const exports = [...symbols.plain].join(', ');
  code += `  return { ${exports}${exports ? ', ' : ''}__vxCleanup, __vxDispose, __vxPending, __vxRuntime: context.runtime, __vxContent: content, __vxComponentScope, __vxForwarded: forwarded };\n`;
  code += `}\n\n`;
  return code;
}

function generateServerHeadlessFactory(contract: ComponentContract): string {
  const exports = contract.exports.map((item) => `${JSON.stringify(item.name)}: ctx[${JSON.stringify(item.name)}]`).join(', ');
  return `export async function createServerHeadlessModule(context) {\n  const ctx = await setupServer({}, context, {});\n  return { exports: Object.freeze({ ${exports} }), dispose() { ctx.__vxDispose(); } };\n}\n`;
}

class ServerViewEmitter {
  code = '';
  private id = 0;
  private sourceId = 0;

  constructor(
    private readonly symbols: ServerSymbols,
    private readonly visual: VisualProgramIR | undefined,
    private readonly component: ComponentCodegenContext | undefined,
    private readonly componentRenderers: ReadonlyMap<string, string>
  ) {}

  walk(node: ViewNode, target: string, indentLevel: number, ctx: string, renderContext: string, content: string, scope: ViewBindings): void {
    const sourceId = this.nextSourceId(node);
    switch (node.kind) {
      case 'Text':
        this.line(indentLevel, `${target} += renderComment(${JSON.stringify(`vx:text:${sourceId}`)}) + renderText(${JSON.stringify(node.value)});`);
        break;
      case 'Widget':
        this.emitWidget(node, sourceId, target, indentLevel, ctx, renderContext, content, scope);
        break;
      case 'IfBlock':
        this.emitIf(node, sourceId, target, indentLevel, ctx, renderContext, content, scope);
        break;
      case 'WhenBlock':
        this.emitWhen(node, sourceId, target, indentLevel, ctx, renderContext, content, scope);
        break;
      case 'KeyedCollection':
        this.emitCollection(node, sourceId, target, indentLevel, ctx, renderContext, content, scope);
        break;
    }
  }

  private emitWidget(node: WidgetNode, sourceId: string, target: string, indentLevel: number, ctx: string, renderContext: string, content: string, scope: ViewBindings): void {
    if (node.tagName === 'Content') {
      this.line(indentLevel, `${target} += renderComment(${JSON.stringify(`vx:content:${sourceId}`)}) + await renderContent(${content}, ${JSON.stringify(contentOutletName(node))}, ${renderContext});`);
      return;
    }
    if (node.tagName === 'Dynamic') {
      this.emitDynamic(node, sourceId, target, indentLevel, ctx, renderContext, content, scope);
      return;
    }
    if (node.tagName === 'Portal') {
      this.line(indentLevel, `${target} += renderComment(${JSON.stringify(`vx:portal:${sourceId}`)});`);
      return;
    }
    const imported = componentImport(this.component, node.tagName);
    if (imported) {
      this.emitComponent(node, sourceId, imported, target, indentLevel, ctx, renderContext, content, scope);
      return;
    }

    const child = this.next('children');
    const attrs = this.next('attrs');
    const visualNode = this.visualNode(node);
    const tag = getPrimitiveTag(node.tagName, visualNode?.semantic?.name);
    this.line(indentLevel, `let ${child} = '';`);
    this.line(indentLevel, `const ${attrs} = Object.create(null);`);
    const formControllerProperty = ['Form', 'FormError', 'ErrorSummary'].includes(node.tagName) ? node.properties.find((property) => property.kind === 'PropBinding' && property.name === 'controller') : undefined;
    const fieldProperty = (isFormControl(node.tagName) || node.tagName === 'FieldError') ? node.properties.find((property) => property.kind === 'PropBinding' && property.name === 'field') : undefined;
    const formController = formControllerProperty ? this.next('form_controller') : undefined;
    const fieldPath = fieldProperty ? this.next('field_path') : undefined;
    if (formController && formControllerProperty?.kind === 'PropBinding') {
      this.line(indentLevel, `const ${formController} = ${this.expression(formControllerProperty.expression.text, ctx, scope)};`);
      if (node.tagName === 'Form') {
        this.line(indentLevel, `Object.assign(${attrs}, serverFormAttributes(${formController}));`);
        this.line(indentLevel, `${child} += renderCsrfField(${renderContext}.csrfToken) + renderMethodOverride(${formController}.config.method);`);
      } else if (node.tagName === 'FormError') {
        this.line(indentLevel, `if (${formController}.snapshot.status === 'failure' && typeof ${formController}.snapshot.result === 'string') ${child} += renderText(${formController}.snapshot.result); else ${attrs}.hidden = true;`);
      } else if (node.tagName === 'ErrorSummary') {
        this.line(indentLevel, `if (${formController}.snapshot.errors.length > 0) { ${attrs}.role = ${attrs}.role ?? 'alert'; ${child} += renderErrorSummary(${formController}); } else ${attrs}.hidden = true;`);
      }
    }
    if (fieldPath && fieldProperty?.kind === 'PropBinding') {
      this.line(indentLevel, `const ${fieldPath} = String(${this.expression(fieldProperty.expression.text, ctx, scope)});`);
      const activeForm = scope['$vxForm'];
      if (activeForm) {
        if (node.tagName === 'FieldError') {
          const fieldError = this.next('field_error');
          this.line(indentLevel, `const ${fieldError} = ${activeForm.root}.field(${fieldPath});`);
          this.line(indentLevel, `Object.assign(${attrs}, serverFieldErrorAttributes(${activeForm.root}, ${fieldPath}));`);
          this.line(indentLevel, `if (${fieldError}.errors.length > 0) ${child} += renderText(${fieldError}.errors.map((issue) => issue.message).join(' ')); else ${attrs}.hidden = true;`);
        } else this.line(indentLevel, `Object.assign(${attrs}, serverFieldAttributes(${activeForm.root}, ${fieldPath}, ${JSON.stringify(node.tagName)}));`);
      }
    }
    if (visualNode?.classNames.length) this.line(indentLevel, `${attrs}.class = ${JSON.stringify(visualNode.classNames.join(' '))};`);
    const dynamicStyles = [...(visualNode?.structural?.properties ?? []), ...(visualNode?.semantic?.properties ?? [])].filter((property) => property.mode === 'dynamic');
    if (dynamicStyles.length > 0) {
      this.line(indentLevel, `${attrs}.style = Object.create(null);`);
      for (const property of dynamicStyles) this.line(indentLevel, `${attrs}.style[${JSON.stringify(property.cssName)}] = ${this.visualExpression(property.expression.text, ctx, scope)};`);
    }
    if (node.tagName === 'Checkbox' || node.tagName === 'Radio') this.line(indentLevel, `${attrs}.type = ${JSON.stringify(node.tagName.toLowerCase())};`);
    if (node.isCall && node.callArgument) {
      const property = callProperty(node.tagName);
      const expression = this.expression(node.callArgument.text, ctx, scope);
      if (isTextProperty(node.tagName, property)) this.line(indentLevel, `${child} += renderText(${expression});`);
      else this.line(indentLevel, `${attrs}[${JSON.stringify(property)}] = ${expression};`);
    }
    for (const property of node.properties) {
      if (property.kind !== 'PropBinding' || property.name === 'ref' || (['Form', 'FormError', 'ErrorSummary'].includes(node.tagName) && property.name === 'controller') || ((isFormControl(node.tagName) || node.tagName === 'FieldError') && property.name === 'field')) continue;
      const expression = this.expression(property.expression.text, ctx, scope);
      if (isTextProperty(node.tagName, property.name)) this.line(indentLevel, `${child} += renderText(${expression});`);
      else this.line(indentLevel, `${attrs}[${JSON.stringify(property.name)}] = ${expression};`);
    }
    const childScope = node.tagName === 'Form' && formController ? { ...scope, $vxForm: { root: formController } } : scope;
    for (const childNode of node.children) this.walk(childNode, child, indentLevel, ctx, renderContext, content, childScope);
    if (node.forwardTarget) {
      this.line(indentLevel, `Object.assign(${attrs}, ${ctx}.__vxForwarded.attributes ?? {});`);
      this.line(indentLevel, `if (${ctx}.__vxForwarded.className != null) ${attrs}.class = [${attrs}.class, ${ctx}.__vxForwarded.className].filter(Boolean).join(' ');`);
      this.line(indentLevel, `if (${ctx}.__vxForwarded.style && typeof ${ctx}.__vxForwarded.style === 'object') ${attrs}.style = { ...(${attrs}.style ?? {}), ...${ctx}.__vxForwarded.style };`);
    }
    this.line(indentLevel, `${target} += renderElement(${JSON.stringify(tag)}, ${attrs}, ${child}, ${JSON.stringify(sourceId)}, ${JSON.stringify(node.tagName)});`);
  }

  private emitComponent(
    node: WidgetNode,
    sourceId: string,
    imported: ComponentCodegenImport,
    target: string,
    indentLevel: number,
    ctx: string,
    renderContext: string,
    content: string,
    scope: ViewBindings
  ): void {
    const renderer = this.componentRenderers.get(imported.moduleId);
    if (!renderer) throw new Error(`Missing server renderer for component '${imported.moduleId}'.`);
    const props = this.next('props');
    const forwarded = this.next('forwarded');
    const providers = this.next('content');
    const propNames = new Set(imported.contract.props.map((prop) => prop.name));
    this.line(indentLevel, `const ${props} = Object.create(null);`);
    this.line(indentLevel, `const ${forwarded} = { attributes: Object.create(null) };`);
    if (node.isCall && node.callArgument) {
      const targetProp = imported.contract.props.find((prop) => prop.required);
      if (targetProp) this.line(indentLevel, `${props}[${JSON.stringify(targetProp.name)}] = ${this.expression(node.callArgument.text, ctx, scope)};`);
    }
    for (const property of node.properties) {
      if (property.kind !== 'PropBinding' || property.name === 'ref') continue;
      const expression = this.expression(property.expression.text, ctx, scope);
      if (propNames.has(property.name)) this.line(indentLevel, `${props}[${JSON.stringify(property.name)}] = ${expression};`);
      else if (property.name === 'class') this.line(indentLevel, `${forwarded}.className = ${expression};`);
      else if (property.name === 'style') this.line(indentLevel, `${forwarded}.style = ${expression};`);
      else this.line(indentLevel, `${forwarded}.attributes[${JSON.stringify(property.name)}] = ${expression};`);
    }
    this.emitContentProviders(node, providers, indentLevel, ctx, renderContext, content, scope);
    this.line(indentLevel, `${target} += renderComment(${JSON.stringify(`vx:component:${sourceId}:start`)}) + await ${renderer}(${props}, ${renderContext}, ${providers}, ${ctx}.__vxComponentScope, ${forwarded}) + renderComment(${JSON.stringify(`vx:component:${sourceId}:end`)});`);
  }

  private emitDynamic(
    node: WidgetNode,
    sourceId: string,
    target: string,
    indentLevel: number,
    ctx: string,
    renderContext: string,
    content: string,
    scope: ViewBindings
  ): void {
    const renderer = this.next('dynamic_renderer');
    const props = this.next('dynamic_props');
    const providers = this.next('dynamic_content');
    this.line(indentLevel, `const ${props} = Object.create(null);`);
    for (const property of node.properties) {
      if (property.kind === 'PropBinding' && property.name !== 'ref') {
        this.line(indentLevel, `${props}[${JSON.stringify(property.name)}] = ${this.expression(property.expression.text, ctx, scope)};`);
      }
    }
    this.emitContentProviders(node, providers, indentLevel, ctx, renderContext, content, scope);
    const selected = node.callArgument ? this.expression(node.callArgument.text, ctx, scope) : 'null';
    this.line(indentLevel, `let ${renderer} = ${selected};`);
    this.line(indentLevel, `if (${renderer}?.__vxLazyComponent === true) ${renderer} = await ${renderer}.load();`);
    this.line(indentLevel, `else ${renderer} = await Promise.resolve(${renderer});`);
    this.line(indentLevel, `${renderer} = typeof ${renderer} === 'function' ? ${renderer} : (${renderer}?.createComponent ?? ${renderer}?.default);`);
    this.line(indentLevel, `if (${renderer}) ${target} += renderComment(${JSON.stringify(`vx:dynamic:${sourceId}:start`)}) + await ${renderer}(${props}, ${renderContext}, ${providers}, ${ctx}.__vxComponentScope, {}) + renderComment(${JSON.stringify(`vx:dynamic:${sourceId}:end`)});`);
  }

  private emitContentProviders(
    node: WidgetNode,
    providers: string,
    indentLevel: number,
    ctx: string,
    renderContext: string,
    content: string,
    scope: ViewBindings
  ): void {
    this.line(indentLevel, `const ${providers} = Object.create(null);`);
    const grouped = new Map<string, ViewNode[][]>();
    if (node.children.length > 0) grouped.set('default', [node.children]);
    for (const region of node.contentRegions) {
      const entries = grouped.get(region.name) ?? [];
      entries.push(region.children);
      grouped.set(region.name, entries);
    }
    for (const [name, entries] of grouped) {
      const functions: string[] = [];
      for (const children of entries) {
        const provider = this.next('provider');
        const html = this.next('provider_html');
        functions.push(provider);
        this.line(indentLevel, `const ${provider} = async () => {`);
        this.line(indentLevel + 1, `let ${html} = '';`);
        for (const childNode of children) this.walk(childNode, html, indentLevel + 1, ctx, renderContext, content, scope);
        this.line(indentLevel + 1, `return ${html};`);
        this.line(indentLevel, `};`);
      }
      this.line(indentLevel, `${providers}[${JSON.stringify(name)}] = ${functions.length === 1 ? functions[0] : `[${functions.join(', ')}]`};`);
    }
  }

  private emitIf(node: Extract<ViewNode, { kind: 'IfBlock' }>, sourceId: string, target: string, indentLevel: number, ctx: string, renderContext: string, content: string, scope: ViewBindings): void {
    const branch = this.next('branch');
    this.line(indentLevel, `let ${branch} = '';`);
    node.branches.forEach((entry, index) => {
      const prefix = index === 0 ? 'if' : entry.condition ? 'else if' : 'else';
      if (entry.condition) this.line(indentLevel, `${prefix} (Boolean(${this.expression(entry.condition.text, ctx, scope)})) {`);
      else this.line(indentLevel, `else {`);
      for (const child of entry.children) this.walk(child, branch, indentLevel + 1, ctx, renderContext, content, scope);
      this.line(indentLevel, `}`);
    });
    this.line(indentLevel, `${target} += renderComment(${JSON.stringify(`vx:if:${sourceId}`)}) + ${branch};`);
  }

  private emitWhen(node: Extract<ViewNode, { kind: 'WhenBlock' }>, sourceId: string, target: string, indentLevel: number, ctx: string, renderContext: string, content: string, scope: ViewBindings): void {
    const selection = this.next('selection');
    const branch = this.next('branch');
    const patterns = node.branches.map((entry) => ({
      category: entry.pattern.category,
      text: entry.pattern.text,
      ...(entry.pattern.name ? { name: entry.pattern.name } : {}),
      ...(entry.pattern.binding ? { binding: entry.pattern.binding } : {}),
      ...(entry.pattern.category === 'literal' ? { literal: entry.pattern.literal } : {})
    }));
    const fallback = node.fallback ? `, ${node.branches.length}` : '';
    this.line(indentLevel, `const ${selection} = selectPatternBranch(${this.expression(node.expression.text, ctx, scope)}, ${JSON.stringify(patterns)}${fallback});`);
    this.line(indentLevel, `let ${branch} = '';`);
    this.line(indentLevel, `switch (${selection}?.key) {`);
    node.branches.forEach((entry, index) => {
      this.line(indentLevel + 1, `case ${index}: {`);
      const branchScope = entry.pattern.binding
        ? { ...scope, [entry.pattern.binding]: { root: selection, path: ['value'] } }
        : scope;
      for (const child of entry.children) this.walk(child, branch, indentLevel + 2, ctx, renderContext, content, branchScope);
      this.line(indentLevel + 2, `break;`);
      this.line(indentLevel + 1, `}`);
    });
    if (node.fallback) {
      this.line(indentLevel + 1, `case ${node.branches.length}: {`);
      for (const child of node.fallback) this.walk(child, branch, indentLevel + 2, ctx, renderContext, content, scope);
      this.line(indentLevel + 2, `break;`);
      this.line(indentLevel + 1, `}`);
    }
    this.line(indentLevel, `}`);
    this.line(indentLevel, `${target} += renderComment(${JSON.stringify(`vx:when:${sourceId}`)}) + ${branch};`);
  }

  private emitCollection(node: Extract<ViewNode, { kind: 'KeyedCollection' }>, sourceId: string, target: string, indentLevel: number, ctx: string, renderContext: string, content: string, scope: ViewBindings): void {
    const item = this.next('item');
    const index = this.next('index');
    const itemHtml = this.next('item_html');
    const fallbacks: string[] = [];
    for (const fallback of node.fallbacks) {
      const renderer = this.next(`${fallback.branch}_fallback`);
      const html = this.next(`${fallback.branch}_html`);
      const binding = fallback.binding ?? '__vxError';
      const params = fallback.branch === 'error' ? binding : '';
      const fallbackScope = fallback.branch === 'error' && fallback.binding ? { ...scope, [fallback.binding]: { root: binding } } : scope;
      this.line(indentLevel, `const ${renderer} = async (${params}) => {`);
      this.line(indentLevel + 1, `let ${html} = '';`);
      for (const child of fallback.children) this.walk(child, html, indentLevel + 1, ctx, renderContext, content, fallbackScope);
      this.line(indentLevel + 1, `return ${html};`);
      this.line(indentLevel, `};`);
      fallbacks.push(`${fallback.branch}: ${renderer}`);
    }
    const itemScope: ViewBindings = {
      ...scope,
      [node.itemName]: { root: item },
      ...(node.indexName ? { [node.indexName]: { root: index } } : {})
    };
    this.line(indentLevel, `${target} += renderComment(${JSON.stringify(`vx:collection:${sourceId}`)}) + await renderCollection(${renderContext}, ${JSON.stringify(sourceId)}, ${this.expression(node.collection.text, ctx, scope)}, async (${item}, ${index}) => {`);
    this.line(indentLevel + 1, `let ${itemHtml} = '';`);
    for (const child of node.children) this.walk(child, itemHtml, indentLevel + 1, ctx, renderContext, content, itemScope);
    this.line(indentLevel + 1, `return ${itemHtml};`);
    this.line(indentLevel, `}, { ${fallbacks.join(', ')} });`);
  }

  private expression(source: string, ctx: string, scope: ViewBindings): string {
    const bindings = new Map<string, JavaScriptBinding>();
    for (const name of this.symbols.plain) bindings.set(name, { root: ctx, path: [name] });
    for (const [name, binding] of Object.entries(scope)) bindings.set(name, binding);
    return lowerExpression(expandInterpolatedExpression(source).source, { bindings });
  }

  private visualExpression(source: string, ctx: string, scope: ViewBindings): string {
    const known = new Set([...this.symbols.plain, ...Object.keys(scope)]);
    return this.expression(normalizeVisualExpression(source, known), ctx, scope);
  }

  private visualNode(widget: WidgetNode): VisualResolvedNode | undefined {
    return this.visual?.nodes.find((node) => node.widget === widget);
  }

  private line(indentLevel: number, text: string): void {
    this.code += `${'  '.repeat(indentLevel)}${text}\n`;
  }

  private next(prefix: string): string {
    return `__vx_${prefix}_${this.id++}`;
  }

  private nextSourceId(node: ViewNode): string {
    return `vxv-${node.span.start.offset}-${this.sourceId++}`;
  }
}

function collectServerSymbols(scriptBlock: ScriptBlockNode | undefined, component: ComponentCodegenContext | undefined): ServerSymbols {
  const plain = new Set<string>();
  if (component?.moduleKind === 'component') plain.add('Self');
  for (const statement of scriptBlock?.statements ?? []) if (statement.name && isRuntimeDeclaration(statement)) plain.add(statement.name);
  for (const imported of component?.imports ?? []) {
    if (imported.moduleKind === 'component' && imported.imported === 'default') plain.add(imported.local);
    else if (imported.moduleKind === 'headless' && imported.imported !== 'default') plain.add(imported.local);
  }
  return { plain };
}

function createServerBindings(symbols: ServerSymbols): Map<string, JavaScriptBinding> {
  return new Map([...symbols.plain].map((name) => [name, { root: name }]));
}

function emitQueryPolicy(policy: QueryPolicyIR | undefined): string {
  if (!policy) return '{}';
  const { enabled: _enabled, tags: _tags, ...runtimePolicy } = policy;
  return JSON.stringify(runtimePolicy);
}

function isInteractive(scriptBlock: ScriptBlockNode | undefined, viewBlock: ViewBlockNode | undefined, component: ComponentCodegenContext | undefined): boolean {
  if (component?.imports.some((entry) => entry.moduleKind === 'component')) return true;
  if (scriptBlock?.statements.some((statement) =>
    statement.kind === 'StateDeclaration' || statement.kind === 'FormDeclaration' || statement.kind === 'ModelDeclarationNode' || statement.kind === 'ContextProvideDeclaration' || statement.kind === 'ContextInjectDeclaration' || statement.kind === 'EffectDeclaration' || statement.kind === 'ActionDeclaration' ||
    statement.kind === 'QueryDeclaration' || statement.kind === 'StoreDeclaration' || statement.kind === 'LifecycleDirective'
  )) return true;
  return containsEvent(viewBlock?.children ?? []);
}

function containsEvent(nodes: readonly ViewNode[]): boolean {
  for (const node of nodes) {
    if (node.kind === 'Widget') {
      if (node.properties.some((property) => property.kind === 'EventBinding')) return true;
      if (containsEvent(node.children)) return true;
      if (node.contentRegions.some((region) => containsEvent(region.children))) return true;
    } else if (node.kind === 'IfBlock') {
      if (node.branches.some((branch) => containsEvent(branch.children))) return true;
    } else if (node.kind === 'WhenBlock') {
      if (node.branches.some((branch) => containsEvent(branch.children)) || (node.fallback && containsEvent(node.fallback))) return true;
    } else if (node.kind === 'KeyedCollection') {
      if (containsEvent(node.children) || node.fallbacks.some((fallback) => containsEvent(fallback.children))) return true;
    }
  }
  return false;
}

function isFormControl(widgetName: string): boolean {
  return FORM_CONTROL_WIDGETS.has(widgetName);
}

function getPrimitiveTag(widgetName: string, semanticRole?: string): string {
  if (semanticRole === 'title') return 'h1';
  if (semanticRole === 'subtitle') return 'p';
  if (semanticRole === 'code') return 'code';
  return PRIMITIVE_NATIVE_ELEMENTS[widgetName] ?? 'div';
}

function callProperty(widgetName: string): string {
  return PRIMITIVE_CALL_PROPERTIES[widgetName] ?? 'text';
}

function isTextProperty(widgetName: string, property: string): boolean {
  return property === 'text' || property === 'label' || (property === 'value' && widgetName === 'TextArea');
}

function indent(source: string, spaces: number): string {
  if (!source.trim()) return `${' '.repeat(spaces)}// empty`;
  const prefix = ' '.repeat(spaces);
  return source.split('\n').map((line) => `${prefix}${line}`).join('\n');
}
