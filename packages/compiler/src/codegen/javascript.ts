import ts from 'typescript';
import { isFunctionScope, isShadowed, withNodeScope } from '../javascript-scopes.js';

export interface JavaScriptBinding {
  root: string;
  path?: readonly string[];
  signal?: boolean;
}

export interface TransformJavaScriptOptions {
  bindings: ReadonlyMap<string, JavaScriptBinding>;
  locals?: readonly string[];
}

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  removeComments: false
};

/**
 * Lowers a VX expression into executable JavaScript. Component declarations
 * are replaced structurally through the TypeScript AST, never through regex.
 */
export function lowerExpression(source: string, options: TransformJavaScriptOptions): string {
  const wrapped = `const __vx_value = (${source});`;
  const output = transformAndTranspile(wrapped, options);
  const sourceFile = ts.createSourceFile('vx-expression.js', output, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const statement = sourceFile.statements.find(ts.isVariableStatement);
  const declaration = statement?.declarationList.declarations[0];
  if (!declaration?.initializer) return 'undefined';
  return printer.printNode(ts.EmitHint.Expression, declaration.initializer, sourceFile);
}

/** Lowers a VX action/reaction/lifecycle body into executable JavaScript. */
export function lowerBody(source: string, options: TransformJavaScriptOptions): string {
  const wrapped = `function __vx_body(${(options.locals ?? []).join(', ')}) {\n${source}\n}`;
  const output = transformAndTranspile(wrapped, options);
  const sourceFile = ts.createSourceFile('vx-body.js', output, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const fn = sourceFile.statements.find(ts.isFunctionDeclaration);
  if (!fn?.body) return '';
  return fn.body.statements.map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile)).join('\n');
}


/** Returns true when the action body contains await outside nested functions. */
export function bodyContainsAwait(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    'vx-await-check.ts',
    `function __vx_body() {\n${source}\n}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const wrapper = sourceFile.statements.find(ts.isFunctionDeclaration);
  if (!wrapper?.body) return false;

  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (node !== wrapper && isFunctionScope(node)) return;
    if (ts.isAwaitExpression(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(wrapper.body);
  return found;
}

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function transformAndTranspile(source: string, options: TransformJavaScriptOptions): string {
  const result = ts.transpileModule(source, {
    compilerOptions,
    fileName: 'component-fragment.ts',
    transformers: {
      before: [createBindingTransformer(options.bindings)]
    },
    reportDiagnostics: false
  });
  return result.outputText;
}

function createBindingTransformer(
  bindings: ReadonlyMap<string, JavaScriptBinding>
): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    function visit(node: ts.Node, scopes: readonly ReadonlySet<string>[]): ts.VisitResult<ts.Node> {
      const activeScopes = withNodeScope(node, scopes);

      if (ts.isShorthandPropertyAssignment(node)) {
        const binding = isShadowed(node.name.text, activeScopes) ? undefined : bindings.get(node.name.text);
        if (binding) {
          return context.factory.createPropertyAssignment(node.name, createBindingExpression(context.factory, binding));
        }
      }

      if (ts.isIdentifier(node) && isReferenceIdentifier(node) && !isShadowed(node.text, activeScopes)) {
        const binding = bindings.get(node.text);
        if (binding) return createBindingExpression(context.factory, binding);
      }

      return ts.visitEachChild(node, (child) => visit(child, activeScopes), context);
    }

    return (sourceFile) => visit(sourceFile, []) as ts.SourceFile;
  };
}

function createBindingExpression(factory: ts.NodeFactory, binding: JavaScriptBinding): ts.Expression {
  let expression: ts.Expression = factory.createIdentifier(binding.root);
  for (const segment of binding.path ?? []) {
    expression = factory.createPropertyAccessExpression(expression, segment);
  }
  if (binding.signal) {
    expression = factory.createPropertyAccessExpression(expression, 'value');
  }
  return expression;
}

function isReferenceIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent || isInsideTypeNode(node)) return false;

  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return false;
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return false;
  if (ts.isPropertySignature(parent) && parent.name === node) return false;
  if (ts.isMethodSignature(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;
  if (ts.isFunctionExpression(parent) && parent.name === node) return false;
  if (ts.isClassDeclaration(parent) && parent.name === node) return false;
  if (ts.isClassExpression(parent) && parent.name === node) return false;
  if (ts.isInterfaceDeclaration(parent) && parent.name === node) return false;
  if (ts.isTypeAliasDeclaration(parent) && parent.name === node) return false;
  if (ts.isEnumDeclaration(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.name === node) return false;
  if (ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent)) return false;
  if (ts.isExportSpecifier(parent)) return false;
  if (ts.isLabeledStatement(parent) && parent.label === node) return false;
  if ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node) return false;
  if (ts.isQualifiedName(parent) && parent.right === node) return false;

  return true;
}

function isInsideTypeNode(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isTypeNode(current)) return true;
    if (
      ts.isExpression(current) ||
      ts.isStatement(current) ||
      ts.isSourceFile(current) ||
      ts.isParameter(current) ||
      ts.isVariableDeclaration(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}
