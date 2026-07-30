import type { ActionDeclaration, Diagnostic, EffectDeclaration, ExecutionSide, ParameterNode, QueryArgumentNode, QueryDeclaration, QueryPolicyEntryNode, SourcePosition, StoreDeclaration, StoreLifetime, TypeExpressionNode } from '@vx/types';
import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { readBraceBody, readLineExpression, readStringLiteralValue } from './expression.js';
import { type Scanner } from './scanner.js';
import { recoverToNextLine } from './script-parser-utils.js';

export function parseQuery(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): QueryDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();

  if (!scanner.matchKeyword('from')) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        `Expected 'from' after query name '${name}'.`,
        scanner.span(start)
      )
    );
  }

  scanner.skipInlineWhitespace();
  const source = readLineExpression(scanner, ['{']);
  scanner.skipWhitespaceAndComments();

  const args: QueryArgumentNode[] = [];
  const policy: QueryPolicyEntryNode[] = [];
  if (!scanner.match('{')) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        `Expected '{' after query source '${source.text}'.`,
        scanner.span(start)
      )
    );
    return { kind: 'QueryDeclaration', name, side, source, arguments: args, policy, span: scanner.span(start) };
  }

  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === '}') break;

    const memberStart = scanner.position();
    if (scanner.matchKeyword('policy')) {
      parseQueryPolicy(scanner, policy, diagnostics, memberStart);
      continue;
    }

    const argName = scanner.readIdentifier();
    scanner.skipInlineWhitespace();

    if (!argName || !scanner.match(':')) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.ExpectedToken,
          `Expected a query input in the form 'name: expression' or a 'policy { ... }' block.`,
          scanner.span(memberStart)
        )
      );
      recoverToNextLine(scanner);
      continue;
    }

    scanner.skipInlineWhitespace();
    const expression = readLineExpression(scanner, ['}']);
    args.push({ kind: 'QueryArgument', name: argName, expression, span: scanner.span(memberStart) });
  }

  if (!scanner.match('}')) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        `Expected '}' to close query '${name}'.`,
        scanner.span(start)
      )
    );
  }

  return { kind: 'QueryDeclaration', name, side, source, arguments: args, policy, span: scanner.span(start) };
}

function parseQueryPolicy(
  scanner: Scanner,
  entries: QueryPolicyEntryNode[],
  diagnostics: Diagnostic[],
  start: SourcePosition
): void {
  scanner.skipWhitespaceAndComments();
  if (!scanner.match('{')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, "Expected '{' after 'policy'.", scanner.span(start))
    );
    recoverToNextLine(scanner);
    return;
  }

  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === '}') {
      scanner.advance();
      return;
    }

    const entryStart = scanner.position();
    const name = scanner.readIdentifier();
    scanner.skipInlineWhitespace();
    if (!name || !scanner.match(':')) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.ExpectedToken,
          "Expected a query policy entry in the form 'name: value'.",
          scanner.span(entryStart)
        )
      );
      recoverToNextLine(scanner);
      continue;
    }

    scanner.skipInlineWhitespace();
    const expression = readLineExpression(scanner, ['}']);
    entries.push({ kind: 'QueryPolicyEntry', name, expression, span: scanner.span(entryStart) });
  }

  diagnostics.push(
    createDiagnostic(DiagnosticCodes.ExpectedToken, "Expected '}' to close the query policy block.", scanner.span(start))
  );
}

function parseParameterList(scanner: Scanner): ParameterNode[] {
  const parameters: ParameterNode[] = [];

  for (;;) {
    scanner.skipWhitespaceAndComments();
    if (scanner.isAtEnd || scanner.peek() === ')') {
      break;
    }

    const paramStart = scanner.position();
    const name = scanner.readIdentifier();
    scanner.skipInlineWhitespace();

    let optional = false;
    if (scanner.peek() === '?') {
      scanner.advance();
      optional = true;
    }

    scanner.skipInlineWhitespace();
    let typeAnnotation: TypeExpressionNode | undefined;

    if (scanner.peek() === ':') {
      scanner.advance();
      scanner.skipInlineWhitespace();
      const typeExpression = readLineExpression(scanner, [',', ')']);
      typeAnnotation = { kind: 'TypeExpression', text: typeExpression.text, span: typeExpression.span };
    }

    parameters.push({
      kind: 'Parameter',
      name,
      span: scanner.span(paramStart),
      ...(optional ? { optional } : {}),
      ...(typeAnnotation !== undefined ? { typeAnnotation } : {})
    });

    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === ',') {
      scanner.advance();
      continue;
    }

    break;
  }

  return parameters;
}

export function parseAction(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): ActionDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();

  let parameters: ParameterNode[] = [];
  if (scanner.peek() === '(') {
    scanner.advance();
    parameters = parseParameterList(scanner);
    scanner.skipWhitespaceAndComments();
    if (!scanner.match(')')) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.ExpectedToken,
          `Expected ')' to close the parameter list of action '${name}'.`,
          scanner.span(start)
        )
      );
    }
  } else {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        `Expected '(' after action name '${name}'.`,
        scanner.span(start)
      )
    );
  }

  scanner.skipWhitespaceAndComments();
  let returnType: TypeExpressionNode | undefined;
  if (scanner.peek() === ':') {
    scanner.advance();
    scanner.skipInlineWhitespace();
    const typeExpression = readLineExpression(scanner, ['{']);
    returnType = { kind: 'TypeExpression', text: typeExpression.text, span: typeExpression.span };
  }

  scanner.skipWhitespaceAndComments();
  const { body, terminated } = readBraceBody(scanner);

  if (!terminated) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.UnterminatedLifecycleBlock,
        `Action '${name}' body is missing a closing '}'.`,
        scanner.span(start)
      )
    );
  }

  return { kind: 'ActionDeclaration', name, side, parameters, body, span: scanner.span(start), ...(returnType ? { returnType } : {}) };
}

export function parseEffect(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): EffectDeclaration {
  scanner.skipWhitespaceAndComments();
  const name = scanner.peek() === '{' ? undefined : scanner.readIdentifier();
  scanner.skipWhitespaceAndComments();
  const { body, terminated } = readBraceBody(scanner);

  if (!terminated) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.UnterminatedLifecycleBlock,
        `'effect${name ? ` ${name}` : ''}' body is missing a closing '}'.`,
        scanner.span(start)
      )
    );
  }

  return { kind: 'EffectDeclaration', side, body, span: scanner.span(start), ...(name ? { name } : {}) };
}

const STORE_LIFETIMES: readonly StoreLifetime[] = [
  'component',
  'tree',
  'route',
  'session',
  'application',
  'request',
  'manual'
];

export function parseStore(
  scanner: Scanner,
  side: ExecutionSide,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): StoreDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();

  if (!scanner.matchKeyword('from')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected 'from' after store name '${name}'.`, scanner.span(start))
    );
  }

  scanner.skipInlineWhitespace();
  const from = readStringLiteralValue(scanner);

  if (from === null) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        `Expected a quoted store key after 'from' in store '${name}'.`,
        scanner.span(start)
      )
    );
  }

  scanner.skipInlineWhitespace();
  let lifetime: StoreLifetime = side === 'server' ? 'request' : 'component';
  if (scanner.matchKeyword('lifetime')) {
    scanner.skipInlineWhitespace();
    const parsed = scanner.readIdentifier() as StoreLifetime;
    if (!STORE_LIFETIMES.includes(parsed)) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.ExpectedToken,
          `Unknown store lifetime '${parsed}'. Expected one of: ${STORE_LIFETIMES.join(', ')}.`,
          scanner.span(start)
        )
      );
    } else {
      lifetime = parsed;
    }
  }

  return { kind: 'StoreDeclaration', name, side, from: from ?? '', lifetime, span: scanner.span(start) };
}
