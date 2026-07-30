import ts from 'typescript';
import type { QueryDeclaration, QueryPolicyIR } from '@vx/types';
import type { DiagnosticCollector } from './diagnostics.js';

export function validateQueryDeclaration(
  query: QueryDeclaration,
  policy: QueryPolicyIR,
  diagnostics: DiagnosticCollector
): void {
  const inputs = new Set<string>();
  for (const argument of query.arguments) {
    if (inputs.has(argument.name)) {
      diagnostics.error(
        'VX_QUERY_DUPLICATE_INPUT',
        `Query '${query.name}' defines input '${argument.name}' more than once.`,
        argument.span,
        'Keep one expression for each query input.'
      );
    }
    inputs.add(argument.name);
    const nondeterministic = findNondeterministicExpression(argument.expression.text);
    if (nondeterministic) {
      diagnostics.error(
        'VX_QUERY_NON_DETERMINISTIC_KEY',
        `Query '${query.name}' input '${argument.name}' uses non-deterministic expression '${nondeterministic}'.`,
        argument.expression.span,
        'Query identity must be derived from deterministic, serializable inputs.'
      );
    }
  }

  if (!query.source.text.trim()) {
    diagnostics.error(
      'VX_QUERY_MISSING_SOURCE',
      `Query '${query.name}' does not declare an operation.`,
      query.span,
      "Declare a typed operation after 'from'."
    );
  }

  if (query.side === 'server' && policy.execution === 'client') {
    diagnostics.error(
      'VX_QUERY_EXECUTION_CONFLICT',
      `Server query '${query.name}' cannot use client-only execution.`,
      query.span,
      "Use 'execute: server' or 'execute: universal'."
    );
  }

  if (query.side === 'client' && policy.execution === 'server') {
    diagnostics.error(
      'VX_QUERY_EXECUTION_CONFLICT',
      `Client query '${query.name}' cannot use server-only execution without a server query boundary.`,
      query.span,
      "Mark the query as 'server query' or use universal/client execution."
    );
  }
}

function findNondeterministicExpression(code: string): string | undefined {
  const source = ts.createSourceFile(
    'vx-query-input.ts',
    `const __vx = (${code});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  let found: string | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date' && !node.arguments?.length) {
      found = 'new Date()';
      return;
    }
    if (ts.isCallExpression(node)) {
      const text = callName(node.expression);
      if (text && NON_DETERMINISTIC_CALLS.has(text)) {
        found = `${text}()`;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const NON_DETERMINISTIC_CALLS = new Set([
  'Date.now',
  'Math.random',
  'performance.now',
  'crypto.randomUUID',
  'crypto.getRandomValues',
  'Symbol'
]);

function callName(expression: ts.LeftHandSideExpression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (!ts.isPropertyAccessExpression(expression)) return undefined;
  const parts: string[] = [expression.name.text];
  let current: ts.Expression = expression.expression;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current)) parts.unshift(current.text);
  return parts.join('.');
}
