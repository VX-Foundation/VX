import type { ConstDeclaration, DeriveDeclaration, ExecutionSide, PropDeclaration, SourcePosition, StateDeclaration, TypeExpressionNode } from '@vx/types';
import { readLineExpression } from './expression.js';
import { type Scanner } from './scanner.js';

export function parseProp(scanner: Scanner, side: ExecutionSide, start: SourcePosition): PropDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  scanner.match(':');
  scanner.skipInlineWhitespace();

  const typeExpression = readLineExpression(scanner, ['=']);
  const typeAnnotation: TypeExpressionNode = {
    kind: 'TypeExpression',
    text: typeExpression.text,
    span: typeExpression.span
  };

  scanner.skipInlineWhitespace();
  let defaultValue: PropDeclaration['defaultValue'];

  if (scanner.peek() === '=') {
    scanner.advance();
    scanner.skipInlineWhitespace();
    defaultValue = readLineExpression(scanner);
  }

  return {
    kind: 'PropDeclaration',
    name,
    side,
    typeAnnotation,
    span: scanner.span(start),
    ...(defaultValue !== undefined ? { defaultValue } : {})
  };
}

export function parseConst(scanner: Scanner, side: ExecutionSide, start: SourcePosition): ConstDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  scanner.match(':');
  scanner.skipInlineWhitespace();
  const typeExpression = readLineExpression(scanner, ['=']);
  const typeAnnotation: TypeExpressionNode = {
    kind: 'TypeExpression',
    text: typeExpression.text,
    span: typeExpression.span
  };

  scanner.skipInlineWhitespace();
  scanner.match('=');
  scanner.skipInlineWhitespace();
  const initializer = readLineExpression(scanner);

  return { kind: 'ConstDeclaration', name, side, typeAnnotation, initializer, span: scanner.span(start) };
}

export function parseState(scanner: Scanner, side: ExecutionSide, start: SourcePosition): StateDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  scanner.match(':');
  scanner.skipInlineWhitespace();
  const typeExpression = readLineExpression(scanner, ['=']);
  const typeAnnotation: TypeExpressionNode = {
    kind: 'TypeExpression',
    text: typeExpression.text,
    span: typeExpression.span
  };

  scanner.skipInlineWhitespace();
  scanner.match('=');
  scanner.skipInlineWhitespace();
  const initializer = readLineExpression(scanner);

  return { kind: 'StateDeclaration', name, side, typeAnnotation, initializer, span: scanner.span(start) };
}

export function parseComputed(scanner: Scanner, side: ExecutionSide, start: SourcePosition): DeriveDeclaration {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  scanner.match(':');
  scanner.skipInlineWhitespace();
  const typeExpression = readLineExpression(scanner, ['=']);
  const typeAnnotation: TypeExpressionNode = {
    kind: 'TypeExpression',
    text: typeExpression.text,
    span: typeExpression.span
  };

  scanner.skipInlineWhitespace();
  scanner.match('=');
  scanner.skipInlineWhitespace();
  const expression = readLineExpression(scanner);

  return { kind: 'DeriveDeclaration', name, side, typeAnnotation, expression, span: scanner.span(start) };
}
