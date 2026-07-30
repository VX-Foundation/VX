import type { ScriptBlockNode, ViewBlockNode, ViewNode, ExpressionNode, StateStatement } from '@vx/types';
import type { DiagnosticCollector } from './diagnostics.js';
import type { ReactiveGraph } from './graph-builder.js';
import { findForbiddenClientAccess } from './security.js';

interface StatementSource {
  code: string;
  mode: 'expression' | 'body';
}

function getStatementSources(statement: StateStatement): StatementSource[] {
  switch (statement.kind) {
    case 'ConstDeclaration':
    case 'StateDeclaration':
      return [{ code: statement.initializer.text, mode: 'expression' }];
    case 'ModelDeclarationNode':
      return [{ code: statement.defaultValue.text, mode: 'expression' }];
    case 'ContextProvideDeclaration':
      return [{ code: statement.expression.text, mode: 'expression' }];
    case 'ContextInjectDeclaration':
      return statement.fallback ? [{ code: statement.fallback.text, mode: 'expression' }] : [];
    case 'FormDeclaration':
      return statement.options.map((option) => ({ code: option.expression.text, mode: 'expression' as const }));
    case 'DeriveDeclaration':
      return [{ code: statement.expression.text, mode: 'expression' }];
    case 'QueryDeclaration':
      return [
        { code: statement.source.text, mode: 'expression' },
        ...statement.arguments.map((argument) => ({ code: argument.expression.text, mode: 'expression' as const }))
      ];
    case 'ActionDeclaration':
    case 'EffectDeclaration':
    case 'LifecycleDirective':
      return [{ code: statement.body, mode: 'body' }];
    case 'PropDeclaration':
    case 'StoreDeclaration':
    case 'ImportDeclaration':
    case 'OutputDeclaration':
    case 'ContentDeclaration':
    case 'VisualPartDeclaration':
    case 'GenericDeclaration':
    case 'SchemaDeclaration':
    case 'ForwardDeclaration':
      return [];
  }
}

export function validatePartitioning(
  _scriptBlock: ScriptBlockNode,
  viewBlock: ViewBlockNode | undefined,
  graph: ReactiveGraph,
  diagnostics: DiagnosticCollector
): void {
  const serverDeclarations = new Set<string>();
  const clientDeclarations = new Set<string>();

  for (const [id, node] of graph.nodes) {
    if (node.statement.side === 'server') serverDeclarations.add(id);
    else clientDeclarations.add(id);

    if (node.statement.side !== 'client') continue;
    for (const source of getStatementSources(node.statement)) {
      const forbidden = findForbiddenClientAccess(source.code, source.mode);
      if (!forbidden) continue;
      diagnostics.error(
        forbidden.reason === 'environment secret access' ? 'VX_ENV_LEAK' : 'VX_CLIENT_FORBIDDEN_ACCESS',
        `Client declaration '${id}' accesses ${forbidden.expression}, a ${forbidden.reason}.`,
        node.statement.span,
        'Move the operation behind a server action or server query boundary.'
      );
      break;
    }
  }

  for (const [id, node] of graph.nodes) {
    if (clientDeclarations.has(id)) {
      for (const dependency of node.dependencies) {
        if (!serverDeclarations.has(dependency)) continue;
        const target = graph.nodes.get(dependency)?.statement;
        if (target?.kind === 'ActionDeclaration' || target?.kind === 'QueryDeclaration') continue;
        diagnostics.error(
          'VX_CROSS_PARTITION_LEAK',
          `Client declaration '${id}' synchronously references server declaration '${dependency}'.`,
          node.statement.span,
          'Use a server action for writes or a server query for reads.'
        );
      }
    } else if (serverDeclarations.has(id)) {
      for (const dependency of node.dependencies) {
        if (!clientDeclarations.has(dependency)) continue;
        diagnostics.error(
          'VX_SERVER_CAPTURE_CLIENT_STATE',
          `Server declaration '${id}' captures client declaration '${dependency}'.`,
          node.statement.span,
          'Pass serializable values as action/query inputs or declare server-owned dependencies.'
        );
      }
    }
  }

  if (viewBlock) walkView(viewBlock.children, diagnostics);
}

function walkView(nodes: readonly ViewNode[], diagnostics: DiagnosticCollector): void {
  const check = (expression: ExpressionNode): void => {
    const forbidden = findForbiddenClientAccess(expression.text, 'expression');
    if (!forbidden) return;
    diagnostics.error(
      forbidden.reason === 'environment secret access' ? 'VX_ENV_LEAK' : 'VX_CLIENT_FORBIDDEN_ACCESS',
      `The view accesses ${forbidden.expression}, a ${forbidden.reason}.`,
      expression.span,
      'View expressions execute in the client partition and cannot contain server secrets or host APIs.'
    );
  };

  for (const node of nodes) {
    if (node.kind === 'Widget') {
      if (node.callArgument) check(node.callArgument);
      for (const property of node.properties) check(property.expression);
      walkView(node.children, diagnostics);
    } else if (node.kind === 'IfBlock') {
      for (const branch of node.branches) {
        if (branch.condition) check(branch.condition);
        walkView(branch.children, diagnostics);
      }
      if (node.transition) check(node.transition.expression);
    } else if (node.kind === 'WhenBlock') {
      check(node.expression);
      for (const branch of node.branches) walkView(branch.children, diagnostics);
      if (node.fallback) walkView(node.fallback, diagnostics);
      if (node.transition) check(node.transition.expression);
    } else if (node.kind === 'KeyedCollection') {
      check(node.collection);
      check(node.key);
      walkView(node.children, diagnostics);
      for (const fallback of node.fallbacks) walkView(fallback.children, diagnostics);
      if (node.transition) check(node.transition.expression);
    }
  }
}
