import ts from 'typescript';

export interface InterpolatedExpression {
  source: string;
  expressions: readonly string[];
}

/**
 * Expands VX string interpolation into a JavaScript expression while leaving
 * ordinary string literals untouched. Interpolation is only recognized when
 * the entire source expression is a string literal.
 */
export function expandInterpolatedExpression(source: string): InterpolatedExpression {
  const file = ts.createSourceFile(
    'vx-interpolation.ts',
    `const __vx = (${source});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const statement = file.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) return { source, expressions: [] };
  let initializer = statement.declarationList.declarations[0]?.initializer;
  while (initializer && ts.isParenthesizedExpression(initializer)) initializer = initializer.expression;
  if (!initializer || (!ts.isStringLiteral(initializer) && !ts.isNoSubstitutionTemplateLiteral(initializer))) {
    return { source, expressions: [] };
  }

  const value = initializer.text;
  const matcher = /\{\{([\s\S]*?)\}\}/g;
  const parts: string[] = [];
  const expressions: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value))) {
    const expression = match[1]!.trim();
    if (!expression) continue;
    const literal = value.slice(cursor, match.index);
    if (literal) parts.push(JSON.stringify(literal));
    parts.push(`String(${expression})`);
    expressions.push(expression);
    cursor = match.index + match[0].length;
  }

  if (expressions.length === 0) return { source, expressions };
  const trailing = value.slice(cursor);
  if (trailing) parts.push(JSON.stringify(trailing));
  return { source: parts.length > 0 ? parts.join(' + ') : `""`, expressions };
}
