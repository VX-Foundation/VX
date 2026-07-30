import type {
  ContentCardinality,
  ContentDeclaration,
  ContextInjectDeclaration,
  ContextProvideDeclaration,
  Diagnostic,
  ForwardDeclaration,
  ForwardKind,
  GenericDeclaration,
  ModelDeclarationNode,
  ExecutionSide,
  ImportDeclaration,
  ImportSpecifierNode,
  OutputDeclaration,
  SourcePosition,
  TypeExpressionNode,
  VisualPartDeclaration,
  VisualPartKind
} from '@vx/types';

import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { readLineExpression, readStringLiteralValue } from './expression.js';
import { type Scanner } from './scanner.js';

const CONTENT_CARDINALITIES: readonly ContentCardinality[] = ['required', 'optional', 'multiple'];
const VISUAL_PART_TYPES: readonly VisualPartKind[] = ['any', 'container', 'text', 'control', 'media'];

/** Parses a static VX import. Dynamic and URL-based imports are intentionally not part of the language. */
export function parseImportDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): ImportDeclaration {
  scanner.skipInlineWhitespace();
  let defaultImport: string | undefined;
  const specifiers: ImportSpecifierNode[] = [];

  if (scanner.peek() === '{') {
    scanner.advance();
    parseNamedSpecifiers(scanner, specifiers, diagnostics, start);
  } else {
    defaultImport = scanner.readIdentifier();
    if (!defaultImport) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.ExpectedToken,
          "Expected a default component name or a named import list after 'import'.",
          scanner.span(start)
        )
      );
    }
  }

  scanner.skipInlineWhitespace();
  if (!scanner.matchKeyword('from')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, "Expected 'from' in the import declaration.", scanner.span(start))
    );
  }

  scanner.skipInlineWhitespace();
  const source = readStringLiteralValue(scanner);
  if (source === null) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        'VX imports require a quoted, static module specifier.',
        scanner.span(start),
        { suggestion: 'Use a relative .vx path or a VX package export.' }
      )
    );
  }

  return {
    kind: 'ImportDeclaration',
    side,
    source: source ?? '',
    specifiers,
    ...(defaultImport ? { defaultImport } : {}),
    span: scanner.span(start)
  };
}

function parseNamedSpecifiers(
  scanner: Scanner,
  specifiers: ImportSpecifierNode[],
  diagnostics: Diagnostic[],
  importStart: SourcePosition
): void {
  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === '}') {
      scanner.advance();
      return;
    }

    const start = scanner.position();
    const imported = scanner.readIdentifier();
    scanner.skipInlineWhitespace();
    let local = imported;

    if (scanner.matchKeyword('as')) {
      scanner.skipInlineWhitespace();
      local = scanner.readIdentifier();
    }

    if (!imported || !local) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.ExpectedToken,
          "Expected a named import in the form 'name' or 'name as alias'.",
          scanner.span(start)
        )
      );
      recoverUntil(scanner, [',', '}']);
    } else {
      specifiers.push({ kind: 'ImportSpecifier', imported, local, span: scanner.span(start) });
    }

    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === ',') {
      scanner.advance();
      continue;
    }
    if (scanner.peek() === '}') {
      scanner.advance();
      return;
    }
  }

  diagnostics.push(
    createDiagnostic(DiagnosticCodes.ExpectedToken, "Expected '}' to close the named import list.", scanner.span(importStart))
  );
}

export function parseOutputDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): OutputDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();

  if (!scanner.match(':')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected ':' after output name '${name}'.`, scanner.span(start))
    );
  }

  scanner.skipInlineWhitespace();
  const parsedType = readLineExpression(scanner);
  const typeText = parsedType.text.trim() || 'Void';
  const typeAnnotation: TypeExpressionNode = {
    kind: 'TypeExpression',
    text: typeText,
    span: parsedType.span
  };

  return { kind: 'OutputDeclaration', name, side, typeAnnotation, span: scanner.span(start) };
}

export function parseContentDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): ContentDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();

  if (!scanner.match(':')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected ':' after content region '${name}'.`, scanner.span(start))
    );
  }

  scanner.skipInlineWhitespace();
  const cardinality = scanner.readIdentifier() as ContentCardinality;
  if (!CONTENT_CARDINALITIES.includes(cardinality)) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        `Unknown content cardinality '${cardinality}'. Expected: ${CONTENT_CARDINALITIES.join(', ')}.`,
        scanner.span(start)
      )
    );
  }

  return {
    kind: 'ContentDeclaration',
    name,
    side,
    cardinality: CONTENT_CARDINALITIES.includes(cardinality) ? cardinality : 'optional',
    span: scanner.span(start)
  };
}

export function parseVisualPartDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): VisualPartDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();

  if (!scanner.match(':')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected ':' after visual part '${name}'.`, scanner.span(start))
    );
  }

  scanner.skipInlineWhitespace();
  const partType = scanner.readIdentifier() as VisualPartKind;
  if (!VISUAL_PART_TYPES.includes(partType)) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        `Unknown visual part type '${partType}'. Expected: ${VISUAL_PART_TYPES.join(', ')}.`,
        scanner.span(start)
      )
    );
  }

  return {
    kind: 'VisualPartDeclaration',
    name,
    side,
    partType: VISUAL_PART_TYPES.includes(partType) ? partType : 'any',
    span: scanner.span(start)
  };
}


/** Parses one compile-time generic parameter used by component prop and output contracts. */
export function parseGenericDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): GenericDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  let constraint: TypeExpressionNode | undefined;
  if (scanner.match(':')) {
    scanner.skipInlineWhitespace();
    const parsed = readLineExpression(scanner);
    if (parsed.text) constraint = { kind: 'TypeExpression', text: parsed.text, span: parsed.span };
  }
  if (!name || !/^[A-Z][A-Za-z0-9_]*$/.test(name)) {
    diagnostics.push(createDiagnostic(
      DiagnosticCodes.SyntaxError,
      `Generic parameter '${name || '<missing>'}' must begin with an uppercase letter.`,
      scanner.span(start)
    ));
  }
  return { kind: 'GenericDeclaration', name, side, ...(constraint ? { constraint } : {}), span: scanner.span(start) };
}

/** Parses a controlled/uncontrolled component model. */
export function parseModelDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): ModelDeclarationNode {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  if (!scanner.match(':')) diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected ':' after model '${name}'.`, scanner.span(start)));
  scanner.skipInlineWhitespace();
  const type = readLineExpression(scanner, ['=']);
  scanner.skipInlineWhitespace();
  if (!scanner.match('=')) diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '=' in model '${name}'.`, scanner.span(start)));
  scanner.skipInlineWhitespace();
  const remainder = readLineExpression(scanner);
  const match = /^(.*)\s+emits\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(remainder.text);
  const defaultText = match?.[1]?.trim() ?? '';
  const outputName = match?.[2] ?? '';
  if (!match || !defaultText) {
    diagnostics.push(createDiagnostic(
      DiagnosticCodes.ExpectedToken,
      `Model '${name}' requires 'model ${name}: Type = default emits outputName'.`,
      scanner.span(start)
    ));
  }
  return {
    kind: 'ModelDeclarationNode',
    name,
    side,
    typeAnnotation: { kind: 'TypeExpression', text: type.text.trim(), span: type.span },
    defaultValue: { kind: 'Expression', text: defaultText, span: remainder.span },
    outputName,
    span: scanner.span(start)
  };
}

/** Parses a component-level context provider. */
export function parseContextProvideDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): ContextProvideDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  if (!scanner.match(':')) diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected ':' after context provider '${name}'.`, scanner.span(start)));
  scanner.skipInlineWhitespace();
  const type = readLineExpression(scanner, ['=']);
  scanner.skipInlineWhitespace();
  if (!scanner.match('=')) diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '=' in context provider '${name}'.`, scanner.span(start)));
  scanner.skipInlineWhitespace();
  const expression = readLineExpression(scanner);
  return { kind: 'ContextProvideDeclaration', name, side, typeAnnotation: { kind: 'TypeExpression', text: type.text.trim(), span: type.span }, expression, span: scanner.span(start) };
}

/** Parses a component-level context consumer. */
export function parseContextInjectDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): ContextInjectDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  if (!scanner.match(':')) diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected ':' after context injection '${name}'.`, scanner.span(start)));
  scanner.skipInlineWhitespace();
  const type = readLineExpression(scanner, ['=']);
  scanner.skipInlineWhitespace();
  let fallback;
  if (scanner.match('=')) {
    scanner.skipInlineWhitespace();
    fallback = readLineExpression(scanner);
  }
  return { kind: 'ContextInjectDeclaration', name, side, typeAnnotation: { kind: 'TypeExpression', text: type.text.trim(), span: type.span }, ...(fallback ? { fallback } : {}), span: scanner.span(start) };
}

/** Parses one closed forwarding capability. */
export function parseForwardDeclaration(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): ForwardDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier() as ForwardKind;
  const allowed: readonly ForwardKind[] = ['attributes', 'events', 'class', 'style'];
  if (!allowed.includes(name)) {
    diagnostics.push(createDiagnostic(
      DiagnosticCodes.SyntaxError,
      `Unknown forwarding capability '${name}'. Expected: ${allowed.join(', ')}.`,
      scanner.span(start)
    ));
  }
  return { kind: 'ForwardDeclaration', name: allowed.includes(name) ? name : 'attributes', side, span: scanner.span(start) };
}

function recoverUntil(scanner: Scanner, characters: readonly string[]): void {
  while (!scanner.isAtEnd && !characters.includes(scanner.peek())) scanner.advance();
}
