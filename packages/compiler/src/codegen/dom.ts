import type {
  DataProgramIR,
  ScriptBlockNode,
  ViewBlockNode,
  ViewSourceMapEntry,
  VisualProgramIR,
} from '@vx-foundation/types';
import type { ReactiveGraph } from '../analyze/graph-builder.js';
import type { ComponentCodegenContext } from '../components/codegen-context.js';
import { generateModuleImports } from './component-module.js';
import { generateApplicationMount, generateComponentFactory, generateHeadlessFactory } from './component-factory.js';
import { collectSymbols, countLines } from './dom-helpers.js';
import type { ComponentSymbols } from './dom-helpers.js';
import { generateSetup } from './dom-setup.js';
import { DomEmitter } from './dom-emitter.js';

export interface GeneratedDomCode {
  code: string;
  viewSourceMap: ViewSourceMapEntry[];
}

/** Generates executable, zero-VDOM client code targeting native DOM. */
export function generateDomCode(
  scriptBlock: ScriptBlockNode | undefined,
  viewBlock: ViewBlockNode | undefined,
  graph: ReactiveGraph,
  data: DataProgramIR,
  visual?: VisualProgramIR,
  component?: ComponentCodegenContext
): GeneratedDomCode {
  const symbols = collectSymbols(scriptBlock, component);
  const moduleImports = generateModuleImports(component);
  const imports = [
    'state',
    'derive',
    'effect',
    'managedEffect',
    'createAction',
    'createQuery',
    'createRuntimeContext',
    'createOwnerId',
    'createCleanupStack',
    'disposeCleanupStack',
    'attachQueryBrowserEvents',
    'acquireStore',
    'setWidgetProperty',
    'markWidget',
    'markViewSource',
    'onWidgetEvent',
    'structuralMount',
    'collectionMount',
    'selectPatternBranch',
    'createServerAction',
    'installStyles',
    'attachVisualIntent',
    'setVisualProperty',
    'applyVisualSemantics',
    'componentProp',
    'componentModel',
    'createComponentScope',
    'onComponentScopeMount',
    'mountComponentScope',
    'provideComponentContext',
    'acquireComponentContext',
    'disposeComponentScope',
    'createOutputDispatcher',
    'mountContentRegion',
    'applyVisualPart',
    'applyForwardedBindings',
    'assignComponentRef',
    'createComponentHandle',
    'dynamicComponentMount',
    'portalMount',
    'removeComponentRange',
    'claimHydrationElement',
    'claimHydrationComment',
    'claimHydrationText'
  ];

  let code = moduleImports.code;
  code += `import { ${imports.join(', ')} } from '@vx-foundation/runtime/client';\n`;
  if (data.schemas.length || data.forms.length) code += `import { schema, createForm } from '@vx-foundation/forms';\nimport { bindFormElement, bindFormField, bindFieldError, bindFormError, bindErrorSummary } from '@vx-foundation/forms/client';\n`;
  code += `\n`;
  code += `function __vxRunCleanup(cleanups) { disposeCleanupStack(cleanups); }\n\n`;
  code += generateSetup(scriptBlock, graph, data, symbols, component, moduleImports.headlessFactories, moduleImports.componentFactories);
  if (component?.moduleKind === 'headless') {
    code += generateHeadlessFactory(component.contract);
    return { code, viewSourceMap: [] };
  }
  const templateStartLine = countLines(code);
  const template = generateTemplate(viewBlock, symbols, visual, component, moduleImports.componentFactories);
  code += template.code;
  code += generateComponentFactory(Boolean(viewBlock), visual);
  code += generateApplicationMount(visual);
  return {
    code,
    viewSourceMap: template.viewSourceMap.map((entry) => ({
      ...entry,
      generated: {
        startLine: entry.generated.startLine + templateStartLine,
        endLine: entry.generated.endLine + templateStartLine
      }
    })).sort((left, right) => left.generated.startLine - right.generated.startLine)
  };
}

function generateTemplate(
  viewBlock: ViewBlockNode | undefined,
  symbols: ComponentSymbols,
  visual: VisualProgramIR | undefined,
  component: ComponentCodegenContext | undefined,
  componentFactories: ReadonlyMap<string, string>
): { code: string; viewSourceMap: ViewSourceMapEntry[] } {
  let code = `export function template(ctx, content = {}, parts = {}, forwarded = {}) {
`;
  code += `  const root = document.createDocumentFragment();
`;
  const emitter = new DomEmitter(symbols, visual, component, componentFactories);

  if (viewBlock) {
    for (const node of viewBlock.children) emitter.walk(node, 'root', 1, 'ctx', 'ctx.__vxCleanup', 'content', 'parts', {});
    code += emitter.code;
  }

  code += `  return root;
`;
  code += `}

`;
  return { code, viewSourceMap: emitter.viewSourceMap };
}
