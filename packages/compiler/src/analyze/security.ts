import ts from 'typescript';

export interface ForbiddenAccess {
  expression: string;
  reason: string;
}

export function findForbiddenClientAccess(code: string, mode: 'expression' | 'body'): ForbiddenAccess | undefined {
  const wrapped = mode === 'body' ? `function __vx() {\n${code}\n}` : `const __vx = (${code});`;
  const source = ts.createSourceFile('vx-security.ts', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let result: ForbiddenAccess | undefined;

  const visit = (node: ts.Node): void => {
    if (result) return;
    if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text) && isValueReference(node)) {
      result = { expression: node.text, reason: 'server or host runtime global' };
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      const path = propertyPath(node);
      if (path === 'process.env' || path === 'Bun.env' || path === 'Deno.env') {
        result = { expression: path, reason: 'environment secret access' };
        return;
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first) && (first.text.startsWith('node:') || NODE_MODULES.has(first.text))) {
        result = { expression: `import(${JSON.stringify(first.text)})`, reason: 'Node-only module import' };
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return result;
}

const FORBIDDEN_GLOBALS = new Set(['process', 'Deno', 'Bun', '__dirname', '__filename']);
const NODE_MODULES = new Set(['fs', 'path', 'os', 'child_process', 'worker_threads', 'net', 'tls', 'http', 'https']);

function propertyPath(node: ts.PropertyAccessExpression): string {
  const parts = [node.name.text];
  let current: ts.Expression = node.expression;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current)) parts.unshift(current.text);
  return parts.join('.');
}

function isValueReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent || ts.isTypeNode(parent)) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return false;
  return true;
}
