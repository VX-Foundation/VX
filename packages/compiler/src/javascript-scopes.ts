import ts from 'typescript';

export type ScopeStack = readonly ReadonlySet<string>[];

export function withNodeScope(node: ts.Node, scopes: ScopeStack): ScopeStack {
  const declared = declarationsForScope(node);
  return declared ? [...scopes, declared] : scopes;
}

export function isShadowed(name: string, scopes: ScopeStack): boolean {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    if (scopes[index]?.has(name)) return true;
  }
  return false;
}

export function isFunctionScope(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node);
}

export function declarationsForScope(node: ts.Node): Set<string> | undefined {
  const names = new Set<string>();

  if (ts.isSourceFile(node)) {
    collectStatementDeclarations(node.statements, names, true);
    return names;
  }

  if (isFunctionScope(node)) {
    const functionNode = node as ts.FunctionLikeDeclaration;
    if (functionNode.name && ts.isIdentifier(functionNode.name)) names.add(functionNode.name.text);
    for (const parameter of functionNode.parameters) addBindingName(parameter.name, names);
    if (functionNode.body && ts.isBlock(functionNode.body)) collectFunctionScopedVarNames(functionNode.body, names);
    return names;
  }

  if (ts.isBlock(node) || ts.isModuleBlock(node)) {
    collectStatementDeclarations(node.statements, names, false);
    return names;
  }

  if (ts.isCaseBlock(node)) {
    for (const clause of node.clauses) collectStatementDeclarations(clause.statements, names, false);
    return names;
  }

  if (ts.isCatchClause(node)) {
    if (node.variableDeclaration) addBindingName(node.variableDeclaration.name, names);
    return names;
  }

  if (ts.isForStatement(node)) {
    if (node.initializer && ts.isVariableDeclarationList(node.initializer)) {
      for (const declaration of node.initializer.declarations) addBindingName(declaration.name, names);
    }
    return names;
  }

  if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    if (ts.isVariableDeclarationList(node.initializer)) {
      for (const declaration of node.initializer.declarations) addBindingName(declaration.name, names);
    }
    return names;
  }

  return undefined;
}

function collectStatementDeclarations(
  statements: ts.NodeArray<ts.Statement>,
  names: Set<string>,
  includeVar: boolean
): void {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      const isVar = (statement.declarationList.flags & ts.NodeFlags.BlockScoped) === 0;
      if (includeVar || !isVar) {
        for (const declaration of statement.declarationList.declarations) addBindingName(declaration.name, names);
      }
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }

    if (ts.isImportDeclaration(statement) && statement.importClause) {
      if (statement.importClause.name) names.add(statement.importClause.name.text);
      const bindings = statement.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) names.add(element.name.text);
      }
    }
  }
}

function collectFunctionScopedVarNames(body: ts.Block, names: Set<string>): void {
  function visit(node: ts.Node): void {
    if (node !== body && (isFunctionScope(node) || ts.isClassLike(node))) return;
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0) {
      for (const declaration of node.declarations) addBindingName(declaration.name, names);
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
}

function addBindingName(name: ts.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) addBindingName(element.name, names);
  }
}
