import type { Diagnostic, ExecutionSide, FormDeclaration, FormOptionNode, SchemaDeclaration, SchemaFieldNode, SchemaRuleNode, SourcePosition } from '@vx-foundation/types';
import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { readBraceBody, readBracketedExpression, readLineExpression } from './expression.js';
import { Scanner } from './scanner.js';
import { recoverToNextLine } from './script-parser-utils.js';

export function parseSchemaDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): SchemaDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipWhitespaceAndComments();
  const bodyStart = scanner.position();
  const { body, terminated } = readBraceBody(scanner);
  if (!name) diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, "Expected a schema name.", scanner.span(start)));
  if (!terminated) diagnostics.push(createDiagnostic(DiagnosticCodes.UnterminatedLifecycleBlock, `Schema '${name}' is missing a closing '}'.`, scanner.span(start)));

  const base = { ...bodyStart, column: bodyStart.column + 1, offset: bodyStart.offset + 1 };
  const bodyScanner = new Scanner(body, scanner.span(start).filePath, base);
  const fields: SchemaFieldNode[] = [];
  while (!bodyScanner.isAtEnd) {
    bodyScanner.skipWhitespaceAndComments();
    if (bodyScanner.isAtEnd) break;
    const fieldStart = bodyScanner.position();
    const fieldName = bodyScanner.readIdentifier();
    if (!fieldName) {
      diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected a field name in schema '${name}'.`, bodyScanner.span(fieldStart)));
      recoverToNextLine(bodyScanner);
      continue;
    }
    let optional = false;
    if (bodyScanner.peek() === '?') { bodyScanner.advance(); optional = true; }
    bodyScanner.skipInlineWhitespace();
    if (!bodyScanner.match(':')) {
      diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected ':' after schema field '${fieldName}'.`, bodyScanner.span(fieldStart)));
      recoverToNextLine(bodyScanner);
      continue;
    }
    bodyScanner.skipInlineWhitespace();
    const type = readLineExpression(bodyScanner, ['|']);
    const rules: SchemaRuleNode[] = [];
    while (bodyScanner.peek() === '|') {
      bodyScanner.advance();
      bodyScanner.skipInlineWhitespace();
      const ruleStart = bodyScanner.position();
      const ruleName = bodyScanner.readIdentifier();
      const args = [];
      bodyScanner.skipInlineWhitespace();
      if (bodyScanner.peek() === '(') {
        const expression = readBracketedExpression(bodyScanner, '(', ')');
        for (const part of splitTopLevelArguments(expression.text)) {
          args.push({ kind: 'Expression' as const, text: part, span: expression.span });
        }
      }
      if (!ruleName) diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected a validation rule after '|'.`, bodyScanner.span(ruleStart)));
      else rules.push({ kind: 'SchemaRule', name: ruleName, arguments: args, span: bodyScanner.span(ruleStart) });
      bodyScanner.skipInlineWhitespace();
    }
    fields.push({
      kind: 'SchemaField',
      name: fieldName,
      optional,
      typeAnnotation: { kind: 'TypeExpression', text: type.text, span: type.span },
      rules,
      span: bodyScanner.span(fieldStart)
    });
    recoverToNextLine(bodyScanner);
  }
  return { kind: 'SchemaDeclaration', name, side, fields, span: scanner.span(start) };
}

export function parseFormDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): FormDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  if (!scanner.match(':')) diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected ':' after form name '${name}'.`, scanner.span(start)));
  scanner.skipInlineWhitespace();
  const schemaName = scanner.readIdentifier();
  scanner.skipWhitespaceAndComments();
  const bodyStart = scanner.position();
  const { body, terminated } = readBraceBody(scanner);
  if (!terminated) diagnostics.push(createDiagnostic(DiagnosticCodes.UnterminatedLifecycleBlock, `Form '${name}' is missing a closing '}'.`, scanner.span(start)));
  const base = { ...bodyStart, column: bodyStart.column + 1, offset: bodyStart.offset + 1 };
  const bodyScanner = new Scanner(body, scanner.span(start).filePath, base);
  const options: FormOptionNode[] = [];
  while (!bodyScanner.isAtEnd) {
    bodyScanner.skipWhitespaceAndComments();
    if (bodyScanner.isAtEnd) break;
    const optionStart = bodyScanner.position();
    const optionName = bodyScanner.readIdentifier();
    bodyScanner.skipInlineWhitespace();
    if (!optionName || !bodyScanner.match(':')) {
      diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected a form option in the form 'name: expression'.`, bodyScanner.span(optionStart)));
      recoverToNextLine(bodyScanner);
      continue;
    }
    bodyScanner.skipInlineWhitespace();
    const expression = readLineExpression(bodyScanner);
    options.push({ kind: 'FormOption', name: optionName, expression, span: bodyScanner.span(optionStart) });
    recoverToNextLine(bodyScanner);
  }
  return { kind: 'FormDeclaration', name, schemaName, side, options, span: scanner.span(start) };
}

function splitTopLevelArguments(source: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) { parts.push(source.slice(start, index).trim()); start = index + 1; }
  }
  const tail = source.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}
