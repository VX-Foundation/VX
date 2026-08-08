import type {
  ContentRegionUseNode,
  Diagnostic,
  ExpressionNode,
  SourcePosition,
  ViewNode,
  VisualPartBindingNode,
  VisualRoleDeclarationNode,
  WidgetNode,
  WidgetProperty,
} from '@vx-foundation/types';

import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { readLineExpression, readParenExpression } from './expression.js';
import { Scanner } from './scanner.js';
import { extractPublicPart, parseContentRegionUse, parseVisualPartBinding } from './component-view-parser.js';
import { parseIfBlock, parseKeyedCollection, parseWhenBlock } from './view-control-parser.js';
import { parseAttachedRoles, parseRoleDeclaration, skipBalancedRoleDeclaration } from './view-role-parser.js';

/** Parses a `#view` region into widget nodes plus local visual-role definitions. */
export function parseViewBlock(
  source: string,
  filePath: string,
  base: SourcePosition
): { children: ViewNode[]; roles: VisualRoleDeclarationNode[]; diagnostics: Diagnostic[] } {
  const scanner = new Scanner(source, filePath, base);
  const diagnostics: Diagnostic[] = [];
  const children: ViewNode[] = [];
  const roles: VisualRoleDeclarationNode[] = [];

  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.isAtEnd) break;

    // Handle `export @role { ... }` at the top level of #view
    if (scanner.lookingAt('export')) {
      const exportStart = scanner.position();
      // Peek ahead to check if it's `export @`
      const saved = scanner.position();
      for (let i = 0; i < 'export'.length; i++) scanner.advance();
      scanner.skipInlineWhitespace();
      if (scanner.peek() === '@') {
        roles.push(parseRoleDeclaration(scanner, diagnostics, true));
      } else {
        // `export` used incorrectly (not before @role)
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.VisualExportOutsideScope,
            "'export' at the top level of #view must be followed by a role declaration '@name { ... }'.",
            scanner.span(exportStart),
            { suggestion: "Use 'export @roleName { ... }' to export a visual role." }
          )
        );
        restore(scanner, saved);
        scanner.advanceUntil('\n');
      }
      continue;
    }

    if (scanner.peek() === '@') {
      roles.push(parseRoleDeclaration(scanner, diagnostics, false));
      continue;
    }

    const node = parseNode(scanner, diagnostics);
    if (node) children.push(node);
  }

  return { children, roles, diagnostics };
}

function parseNodeList(scanner: Scanner, diagnostics: Diagnostic[]): ViewNode[] {
  const nodes: ViewNode[] = [];

  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.isAtEnd || scanner.peek() === '}') break;

    // Detect `export @role` inside a widget body — not allowed
    if (scanner.lookingAt('export')) {
      const start = scanner.position();
      for (let i = 0; i < 'export'.length; i++) scanner.advance();
      scanner.skipInlineWhitespace();
      if (scanner.peek() === '@') {
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.VisualExportInComponentBody,
            "'export @role' is only allowed at the top level of #view, not inside a widget body.",
            scanner.span(start),
            { suggestion: "Move 'export @roleName { ... }' to the top level of #view, after the widget tree." }
          )
        );
        skipBalancedRoleDeclaration(scanner);
      } else {
        // Not `export @`, treat as unknown identifier and recover
        diagnostics.push(
          createDiagnostic(DiagnosticCodes.SyntaxError, "Expected a widget or view control block.", scanner.span(start))
        );
        scanner.advanceUntil('\n');
      }
      continue;
    }

    if (scanner.peek() === '@') {
      const start = scanner.position();
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidVisualRoleDeclaration,
          'Local visual-role declarations are only allowed at the top level of #view.',
          scanner.span(start),
          { suggestion: "Move this '@role { ... }' declaration after the root view tree." }
        )
      );
      skipBalancedRoleDeclaration(scanner);
      continue;
    }

    const node = parseNode(scanner, diagnostics);
    if (node) nodes.push(node);
  }

  return nodes;
}

function parseNode(scanner: Scanner, diagnostics: Diagnostic[]): ViewNode | null {
  const start = scanner.position();
  const word = scanner.readIdentifier();

  if (!word) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.SyntaxError, 'Expected a widget or view control block.', scanner.span(start))
    );
    scanner.advanceUntil('\n');
    return null;
  }

  if (word === 'when') return parseWhenBlock(scanner, start, diagnostics, parseNodeList);
  if (word === 'if') return parseIfBlock(scanner, start, diagnostics, parseNodeList);
  if (word === 'for') return parseKeyedCollection(scanner, start, diagnostics, parseNodeList);
  return parseWidget(scanner, word, start, diagnostics);
}

function parseWidget(scanner: Scanner, tagName: string, start: SourcePosition, diagnostics: Diagnostic[]): WidgetNode {
  scanner.skipInlineWhitespace();

  let isCall = false;
  let callArgument: ExpressionNode | undefined;

  if (scanner.peek() === '(') {
    isCall = true;
    const argument = readParenExpression(scanner);
    if (argument.text.trim().length > 0) callArgument = argument;
  }

  scanner.skipInlineWhitespace();
  const attachedRoles = parseAttachedRoles(scanner, diagnostics);
  const { roles, publicPart, forwardTarget } = extractPublicPart(attachedRoles, diagnostics, tagName);
  scanner.skipWhitespaceAndComments();

  const properties: WidgetProperty[] = [];
  const children: ViewNode[] = [];
  const contentRegions: ContentRegionUseNode[] = [];
  const partBindings: VisualPartBindingNode[] = [];

  if (scanner.peek() === '{') {
    scanner.advance();

    while (!scanner.isAtEnd) {
      scanner.skipWhitespaceAndComments();
      if (scanner.peek() === '}') break;

      // Detect `export @role` inside a widget body — not allowed
      if (scanner.lookingAt('export')) {
        const exportStart = scanner.position();
        for (let i = 0; i < 'export'.length; i++) scanner.advance();
        scanner.skipInlineWhitespace();
        if (scanner.peek() === '@') {
          diagnostics.push(
            createDiagnostic(
              DiagnosticCodes.VisualExportInComponentBody,
              "'export @role' is only allowed at the top level of #view, not inside a widget body.",
              scanner.span(exportStart),
              { suggestion: "Move 'export @roleName { ... }' to the top level of #view, after the widget tree." }
            )
          );
          skipBalancedRoleDeclaration(scanner);
        } else {
          restore(scanner, exportStart);
          // Fall through to identifier parsing below
          const position = scanner.position();
          const identifier = scanner.readIdentifier();
          scanner.skipInlineWhitespace();
          if (identifier && (scanner.peek() === ':' || scanner.lookingAt('=>'))) {
            if (scanner.peek() === ':') {
              scanner.advance();
              scanner.skipInlineWhitespace();
              const expression = readLineExpression(scanner, ['}']);
              properties.push({ kind: 'PropBinding', name: identifier, expression, span: scanner.span(position) });
            } else {
              scanner.match('=>');
              scanner.skipInlineWhitespace();
              const expression = readLineExpression(scanner, ['}']);
              properties.push({ kind: 'EventBinding', name: identifier, expression, span: scanner.span(position) });
            }
          } else {
            restore(scanner, position);
            const child = parseNode(scanner, diagnostics);
            if (child) children.push(child);
          }
        }
        continue;
      }

      const position = scanner.position();
      const identifier = scanner.readIdentifier();
      scanner.skipInlineWhitespace();

      if (identifier === 'content') {
        contentRegions.push(parseContentRegionUse(scanner, position, diagnostics, parseNodeList));
        continue;
      }

      if (identifier === 'part') {
        partBindings.push(parseVisualPartBinding(scanner, position, diagnostics, parseAttachedRoles));
        continue;
      }

      if (identifier && (scanner.peek() === ':' || scanner.lookingAt('=>'))) {
        if (scanner.peek() === ':') {
          scanner.advance();
          scanner.skipInlineWhitespace();
          const expression = readLineExpression(scanner, ['}']);
          properties.push({ kind: 'PropBinding', name: identifier, expression, span: scanner.span(position) });
        } else {
          scanner.match('=>');
          scanner.skipInlineWhitespace();
          const expression = readLineExpression(scanner, ['}']);
          properties.push({ kind: 'EventBinding', name: identifier, expression, span: scanner.span(position) });
        }
        continue;
      }

      // Restore absolute line/column and local offset exactly.
      restore(scanner, position);
      const child = parseNode(scanner, diagnostics);
      if (child) children.push(child);
    }

    if (!scanner.match('}')) {
      diagnostics.push(
        createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '}' to close widget '${tagName}'.`, scanner.span(start))
      );
    }
  } else if (!isCall) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.SyntaxError,
        `Expected '(', '@role', or '{' after widget name '${tagName}'.`,
        scanner.span(start)
      )
    );
  }

  return {
    kind: 'Widget',
    tagName,
    properties,
    roles,
    children,
    contentRegions,
    partBindings,
    ...(publicPart ? { publicPart } : {}),
    ...(forwardTarget ? { forwardTarget: true } : {}),
    isCall,
    ...(callArgument ? { callArgument } : {}),
    span: scanner.span(start)
  };
}


function restore(scanner: Scanner, position: SourcePosition): void {
  // Scanner offsets exposed publicly are local to the slice, while SourcePosition.offset
  // is absolute. The base offset is constant, so derive the local offset from the
  // current absolute/local difference.
  const current = scanner.position();
  const baseOffset = current.offset - scanner.offset;
  scanner.offset = position.offset - baseOffset;
  scanner.line = position.line;
  scanner.column = position.column;
}
