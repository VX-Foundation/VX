import type { ScriptBlockNode, StateStatement } from '@vx-foundation/types';
import type { DiagnosticCollector } from './diagnostics.js';
import { collectReferencedIdentifiers } from './expression-identifiers.js';

export interface ReactiveNode {
  statement: StateStatement;
  id: string; // Internal unique ID
  dependencies: Set<string>;
}

export interface ReactiveGraph {
  nodes: Map<string, ReactiveNode>;
  /** Topologically sorted list of node IDs */
  order: string[];
}

/**
 * Extracts the relevant code string from a StateStatement to find dependencies.
 */
function getStatementCode(stmt: StateStatement): string {
  switch (stmt.kind) {
    case 'ConstDeclaration':
    case 'StateDeclaration':
      return stmt.initializer.text;
    case 'ModelDeclarationNode':
      return stmt.defaultValue.text;
    case 'ContextProvideDeclaration':
      return stmt.expression.text;
    case 'ContextInjectDeclaration':
      return stmt.fallback?.text ?? '';
    case 'DeriveDeclaration':
      return stmt.expression.text;
    case 'FormDeclaration':
      return stmt.options.map((option) => option.expression.text).join(' ');
    case 'QueryDeclaration':
      return [stmt.source.text, ...stmt.arguments.map((argument) => argument.expression.text)].join(' ');
    case 'ActionDeclaration':
    case 'EffectDeclaration':
    case 'LifecycleDirective':
      return stmt.body;
    case 'PropDeclaration':
    case 'StoreDeclaration':
    case 'ImportDeclaration':
    case 'OutputDeclaration':
    case 'ContentDeclaration':
    case 'VisualPartDeclaration':
    case 'GenericDeclaration':
    case 'SchemaDeclaration':
    case 'ForwardDeclaration':
      return ''; // Props and stores are leaves/inputs, they don't depend on other local state directly.
    default:
      return '';
  }
}


function collectQueryIdentifiers(statement: Extract<StateStatement, { kind: 'QueryDeclaration' }>): Set<string> {
  const references = collectReferencedIdentifiers(statement.source.text);
  for (const argument of statement.arguments) {
    for (const identifier of collectReferencedIdentifiers(argument.expression.text)) {
      references.add(identifier);
    }
  }
  return references;
}

/**
 * Builds a dependency graph from a ScriptBlock and sorts it topologically.
 * Reports errors for cyclical dependencies.
 */
export function buildReactiveGraph(scriptBlock: ScriptBlockNode, diagnostics: DiagnosticCollector): ReactiveGraph {
  const nodes = new Map<string, ReactiveNode>();
  
  // 1. Register all declarations
  let anonymousCounter = 0;
  for (const stmt of scriptBlock.statements) {
    if (
      stmt.kind === 'ImportDeclaration' ||
      stmt.kind === 'OutputDeclaration' ||
      stmt.kind === 'ContentDeclaration' ||
      stmt.kind === 'VisualPartDeclaration' ||
      stmt.kind === 'GenericDeclaration' ||
      stmt.kind === 'SchemaDeclaration' ||
      stmt.kind === 'ForwardDeclaration'
    ) continue;

    let id = stmt.kind === 'ContextProvideDeclaration' ? `__provide_${stmt.name}` : stmt.name;
    if (!id) {
      if (stmt.kind === 'EffectDeclaration') {
        id = `__effect_${anonymousCounter++}`;
      } else if (stmt.kind === 'LifecycleDirective') {
        id = `__lifecycle_${stmt.name}_${anonymousCounter++}`;
      } else {
        id = `__anonymous_${anonymousCounter++}`;
      }
    }

    nodes.set(id, {
      statement: stmt,
      id,
      dependencies: new Set(),
    });
  }

  // 2. Discover dependencies
  for (const node of nodes.values()) {
    const code = getStatementCode(node.statement);
    if (!code) continue;

    const idents = node.statement.kind === 'QueryDeclaration'
      ? collectQueryIdentifiers(node.statement)
      : collectReferencedIdentifiers(code, {
          mode:
            node.statement.kind === 'ActionDeclaration' ||
            node.statement.kind === 'EffectDeclaration' ||
            node.statement.kind === 'LifecycleDirective'
              ? 'body'
              : 'expression',
          parameters: node.statement.kind === 'ActionDeclaration'
            ? node.statement.parameters.map((parameter) => parameter.name)
            : []
        });
    for (const ident of idents) {
      if (ident !== node.id && nodes.has(ident)) {
        node.dependencies.add(ident);
      }
    }
  }

  // 3. Topological Sort with Kahn's algorithm / DFS for cycle detection
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  
  function visit(nodeId: string, path: string[]) {
    if (visiting.has(nodeId)) {
      const cyclePath = [...path, nodeId].join(' -> ');
      const node = nodes.get(nodeId)!;
      diagnostics.error(
        'VX_CYCLE_DETECTED',
        `Reactive cycle detected: ${cyclePath}`,
        node.statement.span,
        'Refactor to break the circular dependency. Computed properties and effects must form a Directed Acyclic Graph (DAG).'
      );
      return;
    }
    
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    path.push(nodeId);

    const node = nodes.get(nodeId);
    if (node) {
      for (const dep of node.dependencies) {
        visit(dep, path);
      }
    }

    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    order.push(nodeId); // Push after dependencies are visited
  }

  for (const nodeId of nodes.keys()) {
    if (!visited.has(nodeId)) {
      visit(nodeId, []);
    }
  }

  return {
    nodes,
    order,
  };
}
