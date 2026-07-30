import ts from 'typescript';

/**
 * Visual expressions may mix reactive VX declarations with symbolic design
 * tokens. Unknown identifiers are design tokens, not JavaScript globals.
 */
export function normalizeVisualExpression(source: string, knownBindings: ReadonlySet<string>): string {
  const file = ts.createSourceFile(
    'vx-visual-expression.ts',
    `const __vx = (${source});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const statement = file.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) return source;
  const initializer = statement.declarationList.declarations[0]?.initializer;
  if (!initializer) return source;

  const rootIdentifier = (node: ts.Expression): ts.Identifier | null => {
    let current = node;
    while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) current = current.expression;
    return ts.isIdentifier(current) ? current : null;
  };

  const transformer: ts.TransformerFactory<ts.Expression> = (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isPropertyAccessExpression(node)) {
        const root = rootIdentifier(node);
        if (root && !knownBindings.has(root.text)) return ts.factory.createStringLiteral(node.getText(file));
      }
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        if (ts.isPropertyAccessExpression(parent) && parent.name === node) return node;
        if (knownBindings.has(node.text) || ['undefined', 'NaN', 'Infinity'].includes(node.text)) return node;
        return ts.factory.createStringLiteral(node.text);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (root) => ts.visitNode(root, visit, ts.isExpression) ?? root;
  };

  const result = ts.transform(initializer, [transformer]);
  const transformed = result.transformed[0]!;
  const printer = ts.createPrinter({ removeComments: true });
  const text = printer.printNode(ts.EmitHint.Expression, transformed, file);
  result.dispose();
  return text;
}
