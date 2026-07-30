import ts from 'typescript';

export interface IdentifierAnalysisOptions {
  mode?: 'expression' | 'body';
  parameters?: readonly string[];
}

/** Collects free value identifiers from a VX expression or action/effect body. */
export function collectReferencedIdentifiers(
  code: string,
  options: IdentifierAnalysisOptions = {}
): Set<string> {
  const mode = options.mode ?? 'expression';
  const parameters = options.parameters ?? [];
  const wrapped =
    mode === 'body'
      ? `function __vx(${parameters.join(', ')}) {\n${code}\n}`
      : `const __vx = (${code});`;

  const source = ts.createSourceFile('vx-expression.ts', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const references = new Set<string>();
  const scopes: Array<Set<string>> = [new Set(['__vx', ...parameters])];

  const declare = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      scopes[scopes.length - 1]!.add(name.text);
      return;
    }
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) declare(element.name);
    }
  };

  const isDeclared = (name: string): boolean => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      if (scopes[index]!.has(name)) return true;
    }
    return false;
  };

  const isReferenceIdentifier = (node: ts.Identifier): boolean => {
    const parent = node.parent;

    if (
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node) ||
      (ts.isMethodDeclaration(parent) && parent.name === node) ||
      (ts.isPropertyDeclaration(parent) && parent.name === node) ||
      (ts.isPropertySignature(parent) && parent.name === node) ||
      (ts.isBindingElement(parent) && parent.name === node) ||
      (ts.isVariableDeclaration(parent) && parent.name === node) ||
      (ts.isParameter(parent) && parent.name === node) ||
      (ts.isFunctionDeclaration(parent) && parent.name === node) ||
      (ts.isFunctionExpression(parent) && parent.name === node) ||
      (ts.isClassDeclaration(parent) && parent.name === node) ||
      (ts.isInterfaceDeclaration(parent) && parent.name === node) ||
      (ts.isTypeAliasDeclaration(parent) && parent.name === node) ||
      (ts.isTypeReferenceNode(parent)) ||
      (ts.isQualifiedName(parent)) ||
      (ts.isImportSpecifier(parent)) ||
      (ts.isImportClause(parent)) ||
      (ts.isNamespaceImport(parent)) ||
      (ts.isLabeledStatement(parent) && parent.label === node) ||
      (ts.isBreakOrContinueStatement(parent) && parent.label === node)
    ) {
      return false;
    }

    return true;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      declare(node.name);
      if (node.initializer) visit(node.initializer);
      return;
    }

    if (ts.isFunctionLike(node)) {
      const scope = new Set<string>();
      if ('name' in node && node.name && ts.isIdentifier(node.name)) scope.add(node.name.text);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name)) scope.add(parameter.name.text);
        else {
          const collect = (name: ts.BindingName): void => {
            if (ts.isIdentifier(name)) scope.add(name.text);
            else for (const element of name.elements) if (!ts.isOmittedExpression(element)) collect(element.name);
          };
          collect(parameter.name);
        }
      }
      scopes.push(scope);
      if ('body' in node && node.body) visit(node.body);
      scopes.pop();
      return;
    }

    if (ts.isBlock(node) || ts.isCatchClause(node)) {
      scopes.push(new Set());
      if (ts.isCatchClause(node) && node.variableDeclaration) declare(node.variableDeclaration.name);
      ts.forEachChild(node, visit);
      scopes.pop();
      return;
    }

    if (ts.isIdentifier(node) && isReferenceIdentifier(node) && !isDeclared(node.text)) {
      references.add(node.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return references;
}

const MUTATING_METHODS = new Set([
  'copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift',
  'add', 'clear', 'delete', 'set'
]);

/** Collects free root identifiers mutated by assignments, updates, deletes, or known mutating methods. */
export function collectMutatedIdentifiers(code: string, parameters: readonly string[] = []): Set<string> {
  const source = ts.createSourceFile(
    'vx-body.ts',
    `function __vx(${parameters.join(', ')}) {\n${code}\n}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const mutations = new Set<string>();
  const scopes: Array<Set<string>> = [new Set(['__vx', ...parameters])];

  const declare = (name: ts.BindingName, scope = scopes[scopes.length - 1]!): void => {
    if (ts.isIdentifier(name)) {
      scope.add(name.text);
      return;
    }
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) declare(element.name, scope);
    }
  };

  const isLocal = (name: string): boolean => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      if (scopes[index]!.has(name)) return true;
    }
    return false;
  };

  const rootIdentifier = (expression: ts.Expression): ts.Identifier | null => {
    let current: ts.Expression = expression;
    while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = current.expression;
    }
    return ts.isIdentifier(current) ? current : null;
  };

  const record = (expression: ts.Expression): void => {
    const root = rootIdentifier(expression);
    if (root && !isLocal(root.text)) mutations.add(root.text);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      declare(node.name);
      if (node.initializer) visit(node.initializer);
      return;
    }

    if (ts.isFunctionLike(node)) {
      const scope = new Set<string>();
      if ('name' in node && node.name && ts.isIdentifier(node.name)) scope.add(node.name.text);
      for (const parameter of node.parameters) declare(parameter.name, scope);
      scopes.push(scope);
      if ('body' in node && node.body) visit(node.body);
      scopes.pop();
      return;
    }

    if (ts.isBlock(node) || ts.isCatchClause(node)) {
      scopes.push(new Set());
      if (ts.isCatchClause(node) && node.variableDeclaration) declare(node.variableDeclaration.name);
      ts.forEachChild(node, visit);
      scopes.pop();
      return;
    }

    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      record(node.left);
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      record(node.operand);
    } else if (ts.isDeleteExpression(node)) {
      record(node.expression);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      MUTATING_METHODS.has(node.expression.name.text)
    ) {
      record(node.expression.expression);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return mutations;
}

export function expressionContainsMutationOrAwait(code: string): boolean {
  const source = ts.createSourceFile(
    'vx-pure-expression.ts',
    `const __vx = (${code});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  let forbidden = false;

  const visit = (node: ts.Node): void => {
    if (
      ts.isAwaitExpression(node) ||
      (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) ||
      ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) ||
      ts.isDeleteExpression(node)
    ) {
      forbidden = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return forbidden;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}
