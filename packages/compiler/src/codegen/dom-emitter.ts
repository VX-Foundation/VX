import type { ComponentContract, ViewNode, ViewSourceMapEntry, VisualProgramIR, VisualResolvedNode, WidgetNode } from '@vx/types';
import { lowerExpression } from './javascript.js';
import { expandInterpolatedExpression } from '../interpolation.js';
import { normalizeVisualExpression } from '../visual/expression.js';
import type { ComponentCodegenContext } from '../components/codegen-context.js';
import { componentImport, contentOutletName, emitPartOverride } from './component-module.js';
import { callProperty, createViewBindings, getPrimitiveTag, sourceKind } from './dom-helpers.js';
import type { ComponentSymbols, ViewBindings } from './dom-helpers.js';

export class DomEmitter {
  code = '';
  readonly viewSourceMap: ViewSourceMapEntry[] = [];
  private id = 0;
  private sourceId = 0;
  private generatedLine = 3;

  constructor(
    private readonly symbols: ComponentSymbols,
    private readonly visual: VisualProgramIR | undefined,
    private readonly component: ComponentCodegenContext | undefined,
    private readonly componentFactories: ReadonlyMap<string, string>
  ) {}

  walk(
    node: ViewNode,
    parent: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    const sourceId = this.nextSourceId(node);
    const startLine = this.generatedLine;

    switch (node.kind) {
      case 'Widget':
        this.emitWidget(node, sourceId, parent, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
        break;
      case 'Text': {
        const marker = this.next('text_anchor');
        const text = this.next('text');
        this.line(indentLevel, `const ${marker} = claimHydrationComment(${context}.__vxRuntime.hydration, ${JSON.stringify(`vx:text:${sourceId}`)});`);
        this.line(indentLevel, `${parent}.appendChild(${marker});`);
        this.line(indentLevel, `const ${text} = claimHydrationText(${context}.__vxRuntime.hydration, ${JSON.stringify(sourceId)}, ${JSON.stringify(node.value)});`);
        this.line(indentLevel, `${parent}.appendChild(${text});`);
        break;
      }
      case 'IfBlock':
        this.emitIf(node, sourceId, parent, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
        break;
      case 'WhenBlock':
        this.emitWhen(node, sourceId, parent, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
        break;
      case 'KeyedCollection':
        this.emitCollection(node, sourceId, parent, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
        break;
    }

    this.viewSourceMap.push({
      id: sourceId,
      kind: sourceKind(node),
      span: node.span,
      generated: { startLine, endLine: Math.max(startLine, this.generatedLine - 1) }
    });
  }

  private emitWidget(
    node: WidgetNode,
    sourceId: string,
    parent: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    if (node.tagName === 'Content') {
      this.emitContentOutlet(node, sourceId, parent, indentLevel, context, cleanupTarget, contentContext);
      return;
    }
    if (node.tagName === 'Dynamic') {
      this.emitDynamic(node, sourceId, parent, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
      return;
    }
    if (node.tagName === 'Portal') {
      this.emitPortal(node, parent, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
      return;
    }
    const imported = componentImport(this.component, node.tagName);
    if (imported) {
      this.emitComponent(node, sourceId, imported.contract, imported.moduleId, parent, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
      return;
    }

    const element = this.next('element');
    const visualNode = this.visualNode(node);
    const tag = getPrimitiveTag(node.tagName, visualNode?.semantic?.name);
    this.line(indentLevel, `const ${element} = claimHydrationElement(${context}.__vxRuntime.hydration, ${JSON.stringify(sourceId)}, ${JSON.stringify(tag)});`);
    this.line(indentLevel, `markWidget(${element}, ${JSON.stringify(node.tagName)}, ${JSON.stringify(this.visual?.scopeId)});`);
    this.line(indentLevel, `markViewSource(${element}, ${JSON.stringify(sourceId)});`);
    if (visualNode?.classNames.length) {
      this.line(indentLevel, `attachVisualIntent(${element}, ${JSON.stringify(visualNode.classNames)}, ${JSON.stringify(visualNode.structural?.name ?? null)}, ${JSON.stringify(visualNode.semantic?.name ?? null)});`);
      if (visualNode.semantic) {
        this.line(indentLevel, `applyVisualSemantics(${element}, ${JSON.stringify(node.tagName)}, ${JSON.stringify(visualNode.semantic.name)});`);
      }
      for (const role of [visualNode.structural, visualNode.semantic]) {
        for (const property of role?.properties ?? []) {
          if (property.mode !== 'dynamic') continue;
          const expression = this.visualExpression(property.expression.text, context, scope);
          const effectId = this.next('visual_effect');
          this.line(indentLevel, `const ${effectId} = effect(() => setVisualProperty(${element}, ${JSON.stringify(property.name)}, ${expression}));`);
          this.line(indentLevel, `${cleanupTarget}.push(() => ${effectId}.dispose());`);
        }
      }
    }

    if (node.tagName === 'Checkbox' || node.tagName === 'Radio') {
      this.line(indentLevel, `${element}.type = ${JSON.stringify(node.tagName.toLowerCase())};`);
    }

    if (node.isCall && node.callArgument) {
      this.emitReactiveProperty(element, node.tagName, callProperty(node.tagName), node.callArgument.text, indentLevel, context, cleanupTarget, scope);
    }

    const formControllerBinding = ['Form', 'FormError', 'ErrorSummary'].includes(node.tagName) ? node.properties.find((property) => property.kind === 'PropBinding' && property.name === 'controller') : undefined;
    const formFieldBinding = ['Input', 'TextArea', 'Select', 'Checkbox', 'Radio', 'Switch', 'Slider', 'FieldError'].includes(node.tagName)
      ? node.properties.find((property) => property.kind === 'PropBinding' && property.name === 'field')
      : undefined;
    for (const property of node.properties) {
      if (property.kind === 'PropBinding') {
        if (property === formControllerBinding || property === formFieldBinding) continue;
        if (property.name === 'ref') {
          const refCleanup = this.next('ref_cleanup');
          this.line(indentLevel, `let ${refCleanup} = () => {};`);
          this.line(indentLevel, `${cleanupTarget}.push(onComponentScopeMount(${context}.__vxComponentScope, () => { ${refCleanup} = assignComponentRef(${this.expression(property.expression.text, context, scope)}, ${element}); }));`);
          this.line(indentLevel, `${cleanupTarget}.push(() => ${refCleanup}());`);
        } else {
          this.emitReactiveProperty(element, node.tagName, property.name, property.expression.text, indentLevel, context, cleanupTarget, scope);
        }
      } else {
        const expression = this.expression(property.expression.text, context, {
          ...scope,
          $event: { root: '__vxEvent' },
          $nativeEvent: { root: '__vxNativeEvent' }
        });
        this.line(
          indentLevel,
          `${cleanupTarget}.push(onWidgetEvent(${element}, ${JSON.stringify(node.tagName)}, ${JSON.stringify(property.name)}, (__vxEvent, __vxNativeEvent) => { ${expression}; }));`
        );
      }
    }

    for (const child of node.children) {
      this.walk(child, element, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
    }
    if (node.publicPart) {
      this.line(indentLevel, `${cleanupTarget}.push(applyVisualPart(${element}, ${JSON.stringify(node.publicPart)}, ${partsContext}));`);
    }
    if (node.forwardTarget) {
      this.line(indentLevel, `${cleanupTarget}.push(applyForwardedBindings(${element}, forwarded));`);
    }
    this.line(indentLevel, `${parent}.appendChild(${element});`);
    if (formControllerBinding?.kind === 'PropBinding') {
      const controller = this.expression(formControllerBinding.expression.text, context, scope);
      if (node.tagName === 'Form') this.line(indentLevel, `${cleanupTarget}.push(bindFormElement(${element}, ${controller}, { action: ${element}.getAttribute('action') ?? undefined, method: ${element}.getAttribute('method') ?? undefined }));`);
      else if (node.tagName === 'FormError') this.line(indentLevel, `${cleanupTarget}.push(bindFormError(${element}, ${controller}));`);
      else if (node.tagName === 'ErrorSummary') this.line(indentLevel, `${cleanupTarget}.push(bindErrorSummary(${element}, ${controller}));`);
    }
    if (formFieldBinding?.kind === 'PropBinding') {
      const field = this.expression(formFieldBinding.expression.text, context, scope);
      if (node.tagName === 'FieldError') this.line(indentLevel, `${cleanupTarget}.push(bindFieldError(${element}, ${field}));`);
      else this.line(indentLevel, `${cleanupTarget}.push(bindFormField(${element}, ${field}));`);
    }
  }

  private emitContentOutlet(
    node: WidgetNode,
    sourceId: string,
    parent: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    contentContext: string
  ): void {
    const name = contentOutletName(node);
    const anchor = this.next('content_anchor');
    this.line(indentLevel, `const ${anchor} = claimHydrationComment(${context}.__vxRuntime.hydration, ${JSON.stringify(`vx:content:${sourceId}`)});`);
    this.line(indentLevel, `${parent}.appendChild(${anchor});`);
    this.line(indentLevel, `mountContentRegion(${parent}, ${contentContext}, ${JSON.stringify(name)}, ${cleanupTarget});`);
  }

  private emitComponent(
    node: WidgetNode,
    sourceId: string,
    contract: ComponentContract,
    moduleId: string,
    parent: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    const factory = this.componentFactories.get(moduleId);
    if (!factory) throw new Error(`Missing generated factory for component module '${moduleId}'.`);

    const props = this.next('component_props');
    const outputs = this.next('component_outputs');
    const forwarded = this.next('component_forwarded');
    const content = this.next('component_content');
    const instance = this.next('component_instance');
    let refExpression = 'undefined';
    const propNames = new Set(contract.props.map((prop) => prop.name));
    const outputNames = new Set(contract.outputs.map((output) => output.name));
    this.line(indentLevel, `const ${props} = Object.create(null);`);
    this.line(indentLevel, `const ${outputs} = Object.create(null);`);
    this.line(indentLevel, `const ${forwarded} = { attributes: Object.create(null), events: Object.create(null) };`);

    if (node.isCall && node.callArgument) {
      const target = contract.props.find((prop) => prop.required);
      if (target) this.emitComponentProp(props, target.name, node.callArgument.text, indentLevel, context, cleanupTarget, scope);
    }

    const formControllerBinding = ['Form', 'FormError', 'ErrorSummary'].includes(node.tagName) ? node.properties.find((property) => property.kind === 'PropBinding' && property.name === 'controller') : undefined;
    const formFieldBinding = ['Input', 'TextArea', 'Select', 'Checkbox', 'Radio', 'Switch', 'Slider', 'FieldError'].includes(node.tagName)
      ? node.properties.find((property) => property.kind === 'PropBinding' && property.name === 'field')
      : undefined;
    for (const property of node.properties) {
      if (property.kind === 'PropBinding') {
        if (property === formControllerBinding || property === formFieldBinding) continue;
        if (property.name === 'ref') {
          refExpression = this.expression(property.expression.text, context, scope);
        } else if (propNames.has(property.name)) {
          this.emitComponentProp(props, property.name, property.expression.text, indentLevel, context, cleanupTarget, scope);
        } else if (property.name === 'class') {
          this.emitComponentProp(forwarded, 'className', property.expression.text, indentLevel, context, cleanupTarget, scope);
        } else if (property.name === 'style') {
          this.emitComponentProp(forwarded, 'style', property.expression.text, indentLevel, context, cleanupTarget, scope);
        } else {
          this.emitComponentProp(`${forwarded}.attributes`, property.name, property.expression.text, indentLevel, context, cleanupTarget, scope);
        }
      } else {
        const expression = this.expression(property.expression.text, context, {
          ...scope,
          $event: { root: '__vxEvent' },
          $nativeEvent: { root: '__vxNativeEvent' }
        });
        const target = outputNames.has(property.name) ? outputs : `${forwarded}.events`;
        this.line(indentLevel, `${target}[${JSON.stringify(property.name)}] = (__vxEvent, __vxNativeEvent) => { ${expression}; };`);
      }
    }

    this.emitContentProviders(node, content, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
    const visualNode = this.visualNode(node);
    const overrides = emitPartOverride(visualNode, (source) => this.visualExpression(source, context, scope));
    const options = `{ parentScope: ${context}.__vxComponentScope, forwarded: ${forwarded}, ref: ${refExpression} }`;
    this.line(indentLevel, `const ${instance} = ${factory}(${props}, ${context}.__vxRuntime, ${outputs}, ${content}, ${overrides}, ${options});`);
    this.line(indentLevel, `markViewSource(${instance}.node, ${JSON.stringify(sourceId)});`);
    this.line(indentLevel, `${parent}.appendChild(${instance}.node);`);
    this.line(indentLevel, `${cleanupTarget}.push(onComponentScopeMount(${context}.__vxComponentScope, () => ${instance}.mount?.()));`);
    this.line(indentLevel, `${cleanupTarget}.push(() => ${instance}.dispose());`);
  }

  private emitDynamic(
    node: WidgetNode,
    sourceId: string,
    parent: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    const props = this.next('dynamic_props');
    const outputs = this.next('dynamic_outputs');
    const content = this.next('dynamic_content');
    let refExpression = 'undefined';
    this.line(indentLevel, `const ${props} = Object.create(null);`);
    this.line(indentLevel, `const ${outputs} = Object.create(null);`);
    for (const property of node.properties) {
      if (property.kind === 'PropBinding') {
        if (property.name === 'ref') refExpression = this.expression(property.expression.text, context, scope);
        else this.emitComponentProp(props, property.name, property.expression.text, indentLevel, context, cleanupTarget, scope);
      } else {
        const expression = this.expression(property.expression.text, context, {
          ...scope,
          $event: { root: '__vxEvent' },
          $nativeEvent: { root: '__vxNativeEvent' }
        });
        this.line(indentLevel, `${outputs}[${JSON.stringify(property.name)}] = (__vxEvent, __vxNativeEvent) => { ${expression}; };`);
      }
    }
    this.emitContentProviders(node, content, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
    const resolveProvider = (name: string): string => `(() => { const __vxProvider = ${content}[${JSON.stringify(name)}]; return Array.isArray(__vxProvider) ? __vxProvider[0] : __vxProvider; })()`;
    const target = node.callArgument ? this.expression(node.callArgument.text, context, scope) : 'null';
    this.line(indentLevel, `dynamicComponentMount(${parent}, () => ${target}, {`);
    this.line(indentLevel + 1, `props: ${props}, runtime: ${context}.__vxRuntime, outputs: ${outputs}, content: ${content},`);
    this.line(indentLevel + 1, `parentScope: ${context}.__vxComponentScope, ref: ${refExpression},`);
    this.line(indentLevel + 1, `loading: ${resolveProvider('loading')},`);
    this.line(indentLevel + 1, `error: (() => { const __vxProvider = ${resolveProvider('error')}; return __vxProvider ? () => __vxProvider() : undefined; })()`);
    this.line(indentLevel, `}, ${cleanupTarget});`);
    this.line(indentLevel, `void ${JSON.stringify(sourceId)};`);
  }

  private emitPortal(
    node: WidgetNode,
    parent: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    const content = this.next('portal_content');
    this.emitContentProviders(node, content, indentLevel, context, cleanupTarget, contentContext, partsContext, scope);
    const target = node.callArgument ? this.expression(node.callArgument.text, context, scope) : 'null';
    this.line(indentLevel, `portalMount(() => ${target}, (() => { const __vxProvider = ${content}.default; return Array.isArray(__vxProvider) ? __vxProvider[0] : (__vxProvider ?? (() => null)); })(), ${cleanupTarget});`);
    this.line(indentLevel, `void ${parent};`);
  }

  private emitComponentProp(
    props: string,
    name: string,
    source: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    scope: ViewBindings
  ): void {
    const signal = this.next('component_prop');
    this.line(indentLevel, `const ${signal} = derive(() => ${this.expression(source, context, scope)});`);
    this.line(indentLevel, `${cleanupTarget}.push(() => ${signal}.dispose());`);
    this.line(indentLevel, `${props}[${JSON.stringify(name)}] = ${signal};`);
  }

  private emitContentProviders(
    node: WidgetNode,
    content: string,
    indentLevel: number,
    context: string,
    _cleanupTarget: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    this.line(indentLevel, `const ${content} = Object.create(null);`);
    const grouped = new Map<string, ViewNode[][]>();
    if (node.children.length > 0) grouped.set('default', [node.children]);
    for (const region of node.contentRegions) {
      const providers = grouped.get(region.name) ?? [];
      providers.push(region.children);
      grouped.set(region.name, providers);
    }

    for (const [name, providers] of grouped) {
      const identifiers: string[] = [];
      for (const children of providers) {
        const provider = this.next('content_provider');
        const fragment = this.next('content_fragment');
        const localCleanup = this.next('content_cleanup');
        identifiers.push(provider);
        this.line(indentLevel, `const ${provider} = () => {`);
        this.line(indentLevel + 1, `const ${fragment} = document.createDocumentFragment();`);
        this.line(indentLevel + 1, `const ${localCleanup} = createCleanupStack('content-provider');`);
        for (const child of children) {
          this.walk(child, fragment, indentLevel + 1, context, localCleanup, contentContext, partsContext, scope);
        }
        this.line(indentLevel + 1, `return { node: ${fragment}, cleanup: () => __vxRunCleanup(${localCleanup}) };`);
        this.line(indentLevel, `};`);
      }
      const value = identifiers.length === 1 ? identifiers[0] : `[${identifiers.join(', ')}]`;
      this.line(indentLevel, `${content}[${JSON.stringify(name)}] = ${value};`);
    }
  }

  private emitReactiveProperty(
    element: string,
    widgetName: string,
    propertyName: string,
    source: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    scope: ViewBindings
  ): void {
    const expression = this.expression(source, context, scope);
    const effectId = this.next('effect');
    this.line(
      indentLevel,
      `const ${effectId} = effect(() => setWidgetProperty(${element}, ${JSON.stringify(widgetName)}, ${JSON.stringify(propertyName)}, ${expression}));`
    );
    this.line(indentLevel, `${cleanupTarget}.push(() => ${effectId}.dispose());`);
  }

  private emitIf(
    node: Extract<ViewNode, { kind: 'IfBlock' }>,
    sourceId: string,
    parent: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    const anchor = this.next('anchor');
    const selection = this.next('selection');
    const branchScope = this.next('scope');
    this.line(indentLevel, `const ${anchor} = claimHydrationComment(${context}.__vxRuntime.hydration, ${JSON.stringify(`vx:if:${sourceId}`)});`);
    this.line(indentLevel, `${parent}.appendChild(${anchor});`);
    this.line(indentLevel, `${cleanupTarget}.push(structuralMount(${anchor}, () => {`);
    node.branches.forEach((branch, index) => {
      if (branch.condition) {
        this.line(indentLevel + 1, `if (Boolean(${this.expression(branch.condition.text, context, scope)})) return { key: ${index} };`);
      } else {
        this.line(indentLevel + 1, `return { key: ${index} };`);
      }
    });
    if (node.branches.every((branch) => branch.condition)) this.line(indentLevel + 1, `return null;`);
    this.line(indentLevel, `}, (${selection}, ${branchScope}) => {`);
    this.line(indentLevel + 1, `switch (${selection}.key) {`);
    node.branches.forEach((branch, index) => {
      this.line(indentLevel + 2, `case ${index}: {`);
      this.emitBranchBody(branch.children, indentLevel + 3, context, contentContext, partsContext, scope);
      this.line(indentLevel + 2, `}`);
    });
    this.line(indentLevel + 2, `default: return null;`);
    this.line(indentLevel + 1, `}`);
    this.line(indentLevel, `}${this.transitionArgument(node.transition?.expression.text, context, scope)}));`);
  }

  private emitWhen(
    node: Extract<ViewNode, { kind: 'WhenBlock' }>,
    sourceId: string,
    parent: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    const anchor = this.next('anchor');
    const selection = this.next('selection');
    const branchScope = this.next('scope');
    const patterns = node.branches.map((branch) => ({
      category: branch.pattern.category,
      text: branch.pattern.text,
      ...(branch.pattern.name ? { name: branch.pattern.name } : {}),
      ...(branch.pattern.binding ? { binding: branch.pattern.binding } : {}),
      ...(branch.pattern.category === 'literal' ? { literal: branch.pattern.literal } : {})
    }));
    const fallbackKey = node.fallback ? node.branches.length : undefined;
    const fallbackArgument = fallbackKey === undefined ? '' : `, ${fallbackKey}`;
    this.line(indentLevel, `const ${anchor} = claimHydrationComment(${context}.__vxRuntime.hydration, ${JSON.stringify(`vx:when:${sourceId}`)});`);
    this.line(indentLevel, `${parent}.appendChild(${anchor});`);
    this.line(
      indentLevel,
      `${cleanupTarget}.push(structuralMount(${anchor}, () => selectPatternBranch(${this.expression(node.expression.text, context, scope)}, ${JSON.stringify(patterns)}${fallbackArgument}), (${selection}, ${branchScope}) => {`
    );
    this.line(indentLevel + 1, `switch (${selection}.key) {`);
    node.branches.forEach((branch, index) => {
      this.line(indentLevel + 2, `case ${index}: {`);
      let branchBindings = scope;
      if (branch.pattern.binding) {
        const signal = this.next('match_binding');
        this.line(indentLevel + 3, `const ${signal} = ${branchScope}.binding(${JSON.stringify(branch.pattern.binding)});`);
        branchBindings = { ...scope, [branch.pattern.binding]: { root: signal, signal: true } };
      }
      this.emitBranchBody(branch.children, indentLevel + 3, context, contentContext, partsContext, branchBindings);
      this.line(indentLevel + 2, `}`);
    });
    if (node.fallback) {
      this.line(indentLevel + 2, `case ${node.branches.length}: {`);
      this.emitBranchBody(node.fallback, indentLevel + 3, context, contentContext, partsContext, scope);
      this.line(indentLevel + 2, `}`);
    }
    this.line(indentLevel + 2, `default: return null;`);
    this.line(indentLevel + 1, `}`);
    this.line(indentLevel, `}${this.transitionArgument(node.transition?.expression.text, context, scope)}));`);
  }

  private emitCollection(
    node: Extract<ViewNode, { kind: 'KeyedCollection' }>,
    sourceId: string,
    parent: string,
    indentLevel: number,
    context: string,
    cleanupTarget: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    const anchor = this.next('anchor');
    const rawItem = this.next('raw_item');
    const rawIndex = this.next('raw_index');
    const itemSignal = this.next('item');
    const indexSignal = this.next('index');
    const keyScope: ViewBindings = {
      ...scope,
      [node.itemName]: { root: rawItem },
      ...(node.indexName ? { [node.indexName]: { root: rawIndex } } : {})
    };
    const itemScope: ViewBindings = {
      ...scope,
      [node.itemName]: { root: itemSignal, signal: true },
      ...(node.indexName ? { [node.indexName]: { root: indexSignal, signal: true } } : {})
    };

    this.line(indentLevel, `const ${anchor} = claimHydrationComment(${context}.__vxRuntime.hydration, ${JSON.stringify(`vx:collection:${sourceId}`)});`);
    this.line(indentLevel, `${parent}.appendChild(${anchor});`);
    this.line(indentLevel, `${cleanupTarget}.push(collectionMount(${anchor}, () => ${this.expression(node.collection.text, context, scope)},`);
    this.line(indentLevel + 1, `(${rawItem}, ${rawIndex}) => ${this.expression(node.key.text, context, keyScope)},`);
    this.line(indentLevel + 1, `(${itemSignal}, ${indexSignal}) => {`);
    this.emitBranchBody(node.children, indentLevel + 2, context, contentContext, partsContext, itemScope);
    this.line(indentLevel + 1, `}, {`);

    for (const fallback of node.fallbacks) {
      if (fallback.branch === 'error') {
        const errorSignal = this.next('collection_error');
        const errorScope = fallback.binding
          ? { ...scope, [fallback.binding]: { root: errorSignal, signal: true } }
          : scope;
        this.line(indentLevel + 2, `error: (${errorSignal}) => {`);
        this.emitBranchBody(fallback.children, indentLevel + 3, context, contentContext, partsContext, errorScope);
        this.line(indentLevel + 2, `},`);
      } else {
        this.line(indentLevel + 2, `${fallback.branch}: () => {`);
        this.emitBranchBody(fallback.children, indentLevel + 3, context, contentContext, partsContext, scope);
        this.line(indentLevel + 2, `},`);
      }
    }

    this.line(indentLevel + 1, `}${this.transitionArgument(node.transition?.expression.text, context, scope)}));`);
  }

  private emitBranchBody(
    children: readonly ViewNode[],
    indentLevel: number,
    context: string,
    contentContext: string,
    partsContext: string,
    scope: ViewBindings
  ): void {
    const fragment = this.next('fragment');
    const branchCleanup = this.next('cleanup');
    this.line(indentLevel, `const ${fragment} = document.createDocumentFragment();`);
    this.line(indentLevel, `const ${branchCleanup} = createCleanupStack('structural-branch');`);
    for (const child of children) {
      this.walk(child, fragment, indentLevel, context, branchCleanup, contentContext, partsContext, scope);
    }
    this.line(indentLevel, `return { node: ${fragment}, cleanup: () => __vxRunCleanup(${branchCleanup}) };`);
  }

  private transitionArgument(source: string | undefined, context: string, scope: ViewBindings): string {
    return source ? `, () => ${this.expression(source, context, scope)}` : '';
  }

  private visualExpression(source: string, context: string, scope: ViewBindings): string {
    const known = new Set([...this.symbols.signals, ...this.symbols.plain, ...Object.keys(scope)]);
    return this.expression(normalizeVisualExpression(source, known), context, scope);
  }

  private visualNode(widget: WidgetNode): VisualResolvedNode | undefined {
    return this.visual?.nodes.find((node) => node.widget === widget);
  }

  private expression(source: string, context: string, extra: ViewBindings = {}): string {
    const bindings = createViewBindings(this.symbols, context);
    for (const [name, binding] of Object.entries(extra)) bindings.set(name, binding);
    return lowerExpression(expandInterpolatedExpression(source).source, { bindings });
  }

  private line(indentLevel: number, text: string): void {
    this.code += `${'  '.repeat(indentLevel)}${text}\n`;
    this.generatedLine += 1;
  }

  private next(prefix: string): string {
    return `__vx_${prefix}_${this.id++}`;
  }

  private nextSourceId(node: ViewNode): string {
    return `vxv-${node.span.start.offset}-${this.sourceId++}`;
  }
}

