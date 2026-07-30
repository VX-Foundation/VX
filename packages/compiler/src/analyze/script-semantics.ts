import type { DataProgramIR, ScriptBlockNode, ScriptStatement } from '@vx/types';
import type { DiagnosticCollector } from './diagnostics.js';
import type { ReactiveGraph } from './graph-builder.js';
import { collectMutatedIdentifiers, expressionContainsMutationOrAwait } from './expression-identifiers.js';
import { validateActionDeclaration } from './action-semantics.js';
import { validateEffectDeclaration } from './effect-semantics.js';
import { validateQueryDeclaration } from './query-semantics.js';
import { validateStoreDeclaration } from './store-semantics.js';

const READ_ONLY_KINDS = new Set<ScriptStatement['kind']>([
  'PropDeclaration',
  'ConstDeclaration',
  'DeriveDeclaration',
  'QueryDeclaration',
  'StoreDeclaration',
  'ContextInjectDeclaration',
  'FormDeclaration'
]);

export function validateScriptSemantics(
  script: ScriptBlockNode,
  graph: ReactiveGraph,
  data: DataProgramIR,
  diagnostics: DiagnosticCollector
): void {
  const declarations = new Map<string, ScriptStatement>();

  const queryPolicies = new Map(data.queries.map((query) => [query.name, query.policy]));

  for (const statement of script.statements) {
    if (!statement.name || isContractMetadata(statement) || statement.kind === 'ContextProvideDeclaration') continue;
    const previous = declarations.get(statement.name);
    if (previous) {
      diagnostics.error(
        'VX_SCRIPT_DUPLICATE_DECLARATION',
        `Declaration '${statement.name}' is defined more than once in #script.`,
        statement.span,
        'Rename or remove one of the declarations.'
      );
      continue;
    }
    declarations.set(statement.name, statement);
  }

  for (const statement of script.statements) {
    if (statement.kind === 'QueryDeclaration') {
      validateQueryDeclaration(statement, queryPolicies.get(statement.name)!, diagnostics);
    } else if (statement.kind === 'ActionDeclaration') {
      validateActionDeclaration(statement, diagnostics);
    } else if (statement.kind === 'EffectDeclaration') {
      validateEffectDeclaration(statement, diagnostics);
    } else if (statement.kind === 'StoreDeclaration') {
      validateStoreDeclaration(statement, diagnostics);
    }

    if (statement.kind === 'ConstDeclaration') {
      const node = graph.nodes.get(statement.name);
      for (const dependency of node?.dependencies ?? []) {
        const target = declarations.get(dependency);
        if (target && target.kind !== 'ConstDeclaration') {
          diagnostics.error(
            'VX_CONST_REACTIVE_DEPENDENCY',
            `Constant '${statement.name}' reads reactive declaration '${dependency}'.`,
            statement.span,
            "Use 'derive' when a value must track props, state, queries, stores, or other reactive values."
          );
        }
      }
    }

    if (statement.kind === 'DeriveDeclaration' && expressionContainsMutationOrAwait(statement.expression.text)) {
      diagnostics.error(
        'VX_DERIVE_NOT_PURE',
        `Derived value '${statement.name}' contains mutation or asynchronous work.`,
        statement.span,
        "Keep 'derive' synchronous and pure; move operations to an action, query, or effect."
      );
    }

    if (statement.kind === 'ActionDeclaration') {
      validateMutations(
        statement.body,
        statement.parameters.map((parameter) => parameter.name),
        declarations,
        statement,
        true,
        diagnostics
      );
    }

    if (statement.kind === 'EffectDeclaration' || statement.kind === 'LifecycleDirective') {
      validateMutations(statement.body, [], declarations, statement, false, diagnostics);
    }
  }
}

function isContractMetadata(statement: ScriptStatement): boolean {
  return statement.kind === 'ImportDeclaration' ||
    statement.kind === 'OutputDeclaration' ||
    statement.kind === 'ContentDeclaration' ||
    statement.kind === 'VisualPartDeclaration' ||
    statement.kind === 'GenericDeclaration' ||
    statement.kind === 'SchemaDeclaration' ||
    statement.kind === 'ForwardDeclaration';
}

function validateMutations(
  body: string,
  parameters: readonly string[],
  declarations: Map<string, ScriptStatement>,
  owner: ScriptStatement,
  isAction: boolean,
  diagnostics: DiagnosticCollector
): void {
  for (const name of collectMutatedIdentifiers(body, parameters)) {
    const target = declarations.get(name);
    if (!target) continue;

    if (!isAction && target.kind === 'StateDeclaration') {
      diagnostics.error(
        'VX_STATE_MUTATION_OUTSIDE_ACTION',
        `State '${name}' is mutated outside an action.`,
        owner.span,
        `Expose a named action for the '${name}' mutation.`
      );
      continue;
    }

    if (READ_ONLY_KINDS.has(target.kind)) {
      diagnostics.error(
        'VX_READ_ONLY_MUTATION',
        `Read-only declaration '${name}' cannot be mutated.`,
        owner.span,
        target.kind === 'QueryDeclaration'
          ? 'Perform writes through an action and invalidate or refresh the query.'
          : `Only owned state may be mutated inside an action.`
      );
    }
  }
}
