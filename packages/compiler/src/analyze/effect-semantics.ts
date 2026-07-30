import ts from 'typescript';
import type { EffectDeclaration } from '@vx/types';
import type { DiagnosticCollector } from './diagnostics.js';

export function validateEffectDeclaration(effect: EffectDeclaration, diagnostics: DiagnosticCollector): void {
  if (effect.side === 'server') {
    diagnostics.error(
      'VX_SERVER_EFFECT_SCOPE',
      `Server effect '${effect.name ?? '<anonymous>'}' must be owned by a request-scoped store or server lifecycle.`,
      effect.span,
      'Move it into a request-scoped store when store modules are available, or use a server action.'
    );
  }

  const analysis = analyzeEffectBody(effect.body);
  if (analysis.subscription && !analysis.cleanup) {
    diagnostics.error(
      'VX_EFFECT_MISSING_CLEANUP',
      `Effect '${effect.name ?? '<anonymous>'}' creates a subscription or timer without deterministic cleanup.`,
      effect.span,
      'Return a cleanup function or register one with $effect.onCleanup(...).'
    );
  }
}

function analyzeEffectBody(body: string): { subscription: boolean; cleanup: boolean } {
  const source = ts.createSourceFile(
    'vx-effect.ts',
    `function __vx($effect) {\n${body}\n}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  let subscription = false;
  let cleanup = false;
  const visit = (node: ts.Node): void => {
    if (ts.isReturnStatement(node) && node.expression && (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression))) cleanup = true;
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (name && isSubscriptionCall(name)) subscription = true;
      if (name === '$effect.onCleanup') cleanup = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { subscription, cleanup };
}

const SUBSCRIPTION_CALLS = new Set([
  'setInterval',
  'setTimeout',
  'addEventListener',
  'subscribe',
  'observe',
  'watch'
]);

function isSubscriptionCall(name: string): boolean {
  for (const candidate of SUBSCRIPTION_CALLS) {
    if (name === candidate || name.endsWith(`.${candidate}`)) return true;
  }
  return false;
}

function callName(expression: ts.LeftHandSideExpression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const prefix = callName(expression.expression as ts.LeftHandSideExpression);
    return prefix ? `${prefix}.${expression.name.text}` : expression.name.text;
  }
  return undefined;
}
