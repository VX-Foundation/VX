import type { DataProgramIR, QueryPolicyIR, ScriptBlockNode, ScriptStatement } from '@vx-foundation/types';
import type { ReactiveGraph } from '../analyze/graph-builder.js';
import type { ComponentCodegenContext } from '../components/codegen-context.js';
import { isRuntimeDeclaration } from './component-module.js';
import { bodyContainsAwait, lowerBody, lowerExpression } from './javascript.js';
import { createSetupBindings, indent, type ComponentSymbols } from './dom-helpers.js';
import { emitClientForms, emitSchemas } from '../forms/codegen.js';

export function generateSetup(
  scriptBlock: ScriptBlockNode | undefined,
  graph: ReactiveGraph,
  data: DataProgramIR,
  symbols: ComponentSymbols,
  component: ComponentCodegenContext | undefined,
  headlessFactories: ReadonlyMap<string, string>,
  componentFactories: ReadonlyMap<string, string>
): string {
  let code = `export function setup(props = {}, runtime = {}, outputs = {}, parentScope = null) {\n`;
  code += `  const __vxCleanup = createCleanupStack('component:${component?.contract.id ?? 'anonymous'}');\n`;
  code += `  const __vxMount = [];\n`;
  code += `  const __vxUnmount = [];\n`;
  code += `  const __vxUpdate = [];\n`;
  code += `  const __vxComponentScope = createComponentScope(parentScope);\n`;
  code += `  const __vxRuntime = createRuntimeContext(runtime);\n`;
  code += `  const __vxQueryClient = __vxRuntime.queryClient;\n`;
  code += `  const __vxStores = __vxRuntime.stores;\n`;
  code += `  const __vxOwner = createOwnerId();\n`;
  code += `  const __vxEmit = createOutputDispatcher(outputs, ${JSON.stringify(component?.contract.outputs.map((output) => output.name) ?? [])});\n`;
  code += `  __vxCleanup.push(() => disposeComponentScope(__vxComponentScope));\n`;
  code += `  __vxCleanup.push(() => __vxRuntime.dispose());\n`;
  code += `  __vxCleanup.push(attachQueryBrowserEvents(__vxQueryClient));\n`;
  if (component?.moduleKind === 'component') code += `  const Self = createComponent;\n`;


  const headlessInstances = new Map<string, string>();
  let headlessIndex = 0;
  for (const imported of component?.imports ?? []) {
    if (imported.moduleKind !== 'headless' || headlessInstances.has(imported.moduleId)) continue;
    const factory = headlessFactories.get(imported.moduleId);
    if (!factory) continue;
    const instance = `__vxHeadlessInstance_${headlessIndex++}`;
    headlessInstances.set(imported.moduleId, instance);
    code += `  const ${instance} = ${factory}(__vxRuntime);
`;
    code += `  __vxCleanup.push(() => ${instance}.dispose());
`;
  }
  for (const imported of component?.imports ?? []) {
    if (imported.moduleKind !== 'headless' || imported.imported === 'default') continue;
    const instance = headlessInstances.get(imported.moduleId);
    if (!instance) continue;
    code += `  const ${imported.local} = ${instance}.exports[${JSON.stringify(imported.imported)}];
`;
  }
  for (const imported of component?.imports ?? []) {
    if (imported.moduleKind !== 'component' || imported.imported !== 'default') continue;
    const factory = componentFactories.get(imported.moduleId);
    if (factory) code += `  const ${imported.local} = ${factory};
`;
  }

  if (!scriptBlock) {
    code += `  return { __vxCleanup, __vxMount, __vxUnmount, __vxUpdate, __vxRuntime, __vxComponentScope };\n}\n\n`;
    return code;
  }

  const bindings = createSetupBindings(symbols);
  code += emitSchemas(data.schemas, bindings, '  ');
  const emitted = new Set<ScriptStatement>();
  const queryPolicies = new Map(data.queries.map((query) => [query.name, query.policy]));

  for (const statement of scriptBlock.statements) {
    if (statement.side !== 'server' || statement.kind !== 'ActionDeclaration') continue;
    const proxy = `__vxServer_${statement.name}`;
    code += `  const ${proxy} = createServerAction(${JSON.stringify(`${component?.contract.id ?? 'component'}:${statement.name}`)});\n`;
    const parameters = statement.parameters.map((parameter) => parameter.name);
    code += `  const ${statement.name} = createAction((__vxAction${parameters.length ? `, ${parameters.join(', ')}` : ''}) => ${proxy}(${parameters.join(', ')}), { name: ${JSON.stringify(statement.name)}, queryClient: __vxQueryClient });\n`;
    emitted.add(statement);
  }

  const ordered = graph.order
    .map((id) => graph.nodes.get(id)?.statement)
    .filter((statement): statement is ScriptStatement => Boolean(statement));
  for (const statement of scriptBlock.statements) {
    if (!ordered.includes(statement)) ordered.push(statement);
  }

  let effectId = 0;
  let storeId = 0;
  for (const statement of ordered) {
    if (emitted.has(statement) || statement.side !== 'client') continue;
    emitted.add(statement);

    switch (statement.kind) {
      case 'PropDeclaration': {
        const contract = component?.contract.props.find((prop) => prop.name === statement.name);
        const fallback = statement.defaultValue
          ? `() => ${lowerExpression(statement.defaultValue.text, { bindings })}`
          : 'undefined';
        code += `  const ${statement.name} = componentProp(props, ${JSON.stringify(statement.name)}, ${fallback}, ${String(contract?.required ?? !statement.defaultValue)});
`;
        break;
      }
      case 'ModelDeclarationNode': {
        const fallback = `() => ${lowerExpression(statement.defaultValue.text, { bindings })}`;
        code += `  const ${statement.name} = componentModel(props, ${JSON.stringify(statement.name)}, ${fallback}, __vxEmit, ${JSON.stringify(statement.outputName)});
`;
        code += `  __vxCleanup.push(() => ${statement.name}.dispose());
`;
        break;
      }
      case 'ContextInjectDeclaration': {
        const lease = `__vxContextLease_${statement.name}`;
        const fallback = statement.fallback ? `() => ${lowerExpression(statement.fallback.text, { bindings })}` : 'undefined';
        code += `  const ${lease} = acquireComponentContext(__vxComponentScope.parent, ${JSON.stringify(statement.name)}, ${fallback}, ${String(!statement.fallback)});
`;
        code += `  const ${statement.name} = ${lease}.value;
`;
        code += `  __vxCleanup.push(() => ${lease}.release());
`;
        break;
      }
      case 'ContextProvideDeclaration': {
        const provided = `__vxProvided_${statement.name}`;
        code += `  const ${provided} = derive(() => ${lowerExpression(statement.expression.text, { bindings })});
`;
        code += `  provideComponentContext(__vxComponentScope, ${JSON.stringify(statement.name)}, ${provided});
`;
        code += `  __vxCleanup.push(() => ${provided}.dispose());
`;
        break;
      }
      case 'ConstDeclaration':
        code += `  const ${statement.name} = ${lowerExpression(statement.initializer.text, { bindings })};\n`;
        break;
      case 'StateDeclaration':
        code += `  const ${statement.name} = state(${lowerExpression(statement.initializer.text, { bindings })});\n`;
        break;
      case 'DeriveDeclaration':
        code += `  const ${statement.name} = derive(() => ${lowerExpression(statement.expression.text, { bindings })});\n`;
        break;
      case 'FormDeclaration': {
        code += emitClientForms(data.forms.filter((form) => form.name === statement.name), bindings, '  ', component?.contract.id ?? 'component', '__vxRuntime.formStates');
        break;
      }
      case 'QueryDeclaration': {
        const source = lowerExpression(statement.source.text, { bindings });
        const inputs = statement.arguments
          .map((argument) => `${JSON.stringify(argument.name)}: ${lowerExpression(argument.expression.text, { bindings })}`)
          .join(', ');
        const policy = queryPolicies.get(statement.name);
        const enabled = policy?.enabled ? `, enabled: () => ${lowerExpression(policy.enabled.text, { bindings })}` : '';
        const tags = policy?.tags.length ? `, tags: ${JSON.stringify(policy.tags)}` : '';
        code += `  const ${statement.name} = createQuery(__vxQueryClient, { name: ${JSON.stringify(statement.name)}, source: (__vxInput, __vxQuery) => (${source})(__vxInput, __vxQuery), input: () => ({ ${inputs} }), policy: ${emitQueryPolicy(policy)}${enabled}${tags} });\n`;
        code += `  __vxCleanup.push(() => ${statement.name}.dispose());\n`;
        break;
      }
      case 'ActionDeclaration': {
        const parameters = statement.parameters.map((parameter) => parameter.name);
        const actionBindings = new Map(bindings);
        actionBindings.set('$action', { root: '__vxAction' });
        actionBindings.set('emit', { root: '__vxEmit' });
        actionBindings.set('optimistic', { root: '__vxAction', path: ['optimistic'] });
        actionBindings.set('invalidate', { root: '__vxAction', path: ['invalidate'] });
        actionBindings.set('invalidateTags', { root: '__vxAction', path: ['invalidateTags'] });
        actionBindings.set('progress', { root: '__vxAction', path: ['reportProgress'] });
        actionBindings.set('refresh', { root: '__vxAction', path: ['refresh'] });
        const body = indent(lowerBody(statement.body, { bindings: actionBindings, locals: parameters }), 4);
        const asyncKeyword = bodyContainsAwait(statement.body) ? 'async ' : '';
        code += `  const ${statement.name} = createAction(${asyncKeyword}(__vxAction${parameters.length ? `, ${parameters.join(', ')}` : ''}) => {\n${body}\n  }, { name: ${JSON.stringify(statement.name)}, queryClient: __vxQueryClient });\n`;
        break;
      }
      case 'EffectDeclaration': {
        const id = `__vxEffect${effectId++}`;
        const effectBindings = new Map(bindings);
        effectBindings.set('$effect', { root: '__vxEffectContext' });
        const body = indent(lowerBody(statement.body, { bindings: effectBindings }), 4);
        code += `  const ${id} = managedEffect((__vxEffectContext) => {\n${body}\n  }, { name: ${JSON.stringify(statement.name ?? id)} });\n`;
        code += `  __vxCleanup.push(() => ${id}.dispose());\n`;
        break;
      }
      case 'StoreDeclaration': {
        const lease = `__vxStoreLease${storeId++}`;
        code += `  const ${lease} = acquireStore(__vxStores, ${JSON.stringify(statement.from)}, ${JSON.stringify(statement.lifetime)}, __vxOwner);\n`;
        code += `  const ${statement.name} = ${lease}.value;\n`;
        code += `  __vxCleanup.push(() => ${lease}.release());\n`;
        break;
      }
      case 'LifecycleDirective': {
        const body = indent(lowerBody(statement.body, { bindings }), 4);
        if (statement.name === 'update') {
          const id = `__vxUpdateEffect${effectId++}`;
          const graphNode = Array.from(graph.nodes.values()).find((candidate) => candidate.statement === statement);
          const dependencyReads = Array.from(graphNode?.dependencies ?? [])
            .map((dependency) => symbols.signals.has(dependency) ? `    void ${dependency}.value;` : `    void ${dependency};`)
            .join('\n');
          code += `  let ${id} = null;\n`;
          code += `  const ${id}Mount = onComponentScopeMount(__vxComponentScope, () => {\n`;
          code += `    let ${id}First = true;\n`;
          code += `    ${id} = effect(() => {\n${dependencyReads}${dependencyReads ? '\n' : ''}      if (${id}First) { ${id}First = false; return; }\n${body.replace(/^ {4}/gm, '      ')}\n    });\n`;
          code += `  });\n`;
          code += `  __vxUpdate.push({ dispose() { ${id}Mount(); ${id}?.dispose(); ${id} = null; } });\n`;
        } else {
          const target = statement.name === 'mount' ? '__vxMount' : '__vxUnmount';
          code += `  ${target}.push(() => {\n${body}\n  });\n`;
        }
        break;
      }
      case 'ImportDeclaration':
      case 'OutputDeclaration':
      case 'ContentDeclaration':
      case 'VisualPartDeclaration':
      case 'GenericDeclaration':
      case 'SchemaDeclaration':
      case 'ForwardDeclaration':
        break;
    }
  }

  const exportedNames = scriptBlock.statements
    .filter((statement) =>
      statement.name &&
      isRuntimeDeclaration(statement) &&
      statement.kind !== 'ContextProvideDeclaration' &&
      (statement.side === 'client' || statement.kind === 'ActionDeclaration')
    )
    .map((statement) => statement.name as string);
  const importedNames = (component?.imports ?? [])
    .filter((imported) => imported.imported !== 'default' || imported.moduleKind === 'component')
    .map((imported) => imported.local);
  const names = Array.from(new Set([...importedNames, ...exportedNames]));
  code += `  return { ${names.join(', ')}${names.length ? ', ' : ''}__vxCleanup, __vxMount, __vxUnmount, __vxUpdate, __vxRuntime, __vxComponentScope };\n`;
  code += `}\n\n`;
  return code;
}

function emitQueryPolicy(policy: QueryPolicyIR | undefined): string {
  if (!policy) return '{}';
  const { enabled: _enabled, tags: _tags, ...runtimePolicy } = policy;
  return JSON.stringify(runtimePolicy);
}

