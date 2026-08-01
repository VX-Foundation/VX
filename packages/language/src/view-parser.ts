import type {
  ContentRegionUseNode,
  Diagnostic,
  ExpressionNode,
  SourcePosition,
  ViewNode,
  VisualConditionArgumentNode,
  VisualPartBindingNode,
  VisualConditionNode,
  VisualRoleArgumentNode,
  VisualRoleDeclarationNode,
  VisualRolePropertyNode,
  VisualRoleStateNode,
  VisualRoleUseNode,
  WidgetNode,
  WidgetProperty
} from '@vx-foundation/types';

import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { readLineExpression, readParenExpression } from './expression.js';
import { Scanner } from './scanner.js';
import { extractPublicPart, parseContentRegionUse, parseVisualPartBinding } from './component-view-parser.js';
import { parseIfBlock, parseKeyedCollection, parseWhenBlock } from './view-control-parser.js';

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

    if (scanner.peek() === '@') {
      roles.push(parseRoleDeclaration(scanner, diagnostics));
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

function parseAttachedRoles(scanner: Scanner, diagnostics: Diagnostic[]): VisualRoleUseNode[] {
  const roles: VisualRoleUseNode[] = [];

  while (scanner.peek() === '@') {
    const start = scanner.position();
    scanner.advance();
    const name = scanner.readIdentifier();

    if (!name) {
      diagnostics.push(
        createDiagnostic(DiagnosticCodes.InvalidVisualRole, "Expected a role name after '@'.", scanner.span(start))
      );
      break;
    }

    scanner.skipInlineWhitespace();
    const args = scanner.peek() === '(' ? parseRoleArguments(scanner, diagnostics, name) : [];

    roles.push({ kind: 'VisualRoleUse', name, arguments: args, span: scanner.span(start) });
    scanner.skipInlineWhitespace();
  }

  return roles;
}

function parseRoleArguments(
  scanner: Scanner,
  diagnostics: Diagnostic[],
  roleName: string
): VisualRoleArgumentNode[] {
  const args: VisualRoleArgumentNode[] = [];
  scanner.advance(); // (

  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === ')') {
      scanner.advance();
      return args;
    }

    const start = scanner.position();
    const name = scanner.readIdentifier();
    scanner.skipInlineWhitespace();

    if (!name || !scanner.match(':')) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidVisualRoleArgument,
          `Role '@${roleName}' arguments must use the form 'name: expression'.`,
          scanner.span(start)
        )
      );
      recoverUntil(scanner, [',', ')']);
    } else {
      scanner.skipInlineWhitespace();
      const expression = readLineExpression(scanner, [',', ')']);
      args.push({ kind: 'VisualRoleArgument', name, expression, span: scanner.span(start) });
    }

    scanner.skipInlineWhitespace();
    if (scanner.peek() === ',') {
      scanner.advance();
      continue;
    }
    if (scanner.peek() === ')') {
      scanner.advance();
      return args;
    }
  }

  diagnostics.push(
    createDiagnostic(
      DiagnosticCodes.ExpectedToken,
      `Expected ')' to close arguments for role '@${roleName}'.`,
      args[0]?.span ?? scanner.span(scanner.position())
    )
  );
  return args;
}

function parseRoleDeclaration(scanner: Scanner, diagnostics: Diagnostic[]): VisualRoleDeclarationNode {
  const start = scanner.position();
  scanner.advance();
  const name = scanner.readIdentifier();

  if (!name) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.InvalidVisualRoleDeclaration, "Expected a role name after '@'.", scanner.span(start))
    );
  }

  scanner.skipInlineWhitespace();
  const uses = scanner.lookingAt('uses') ? parseRoleComposition(scanner, diagnostics, name) : [];
  scanner.skipWhitespaceAndComments();

  if (!scanner.match('{')) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.InvalidVisualRoleDeclaration,
        `Expected '{' after local role '@${name || '<missing>'}'.`,
        scanner.span(start)
      )
    );
    return { kind: 'VisualRoleDeclaration', name, uses, properties: [], states: [], span: scanner.span(start) };
  }

  const properties: VisualRolePropertyNode[] = [];
  const states: VisualRoleStateNode[] = [];

  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === '}') break;

    const itemStart = scanner.position();
    const word = scanner.readIdentifier();

    if (word === 'when') {
      states.push(parseRoleState(scanner, itemStart, diagnostics));
      continue;
    }

    scanner.skipInlineWhitespace();
    if (!word || !scanner.match(':')) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidVisualRoleDeclaration,
          `Expected a visual property or 'when <condition> { ... }' inside '@${name}'.`,
          scanner.span(itemStart)
        )
      );
      scanner.advanceUntil('\n');
      continue;
    }

    scanner.skipInlineWhitespace();
    const expression = readLineExpression(scanner, ['}']);
    properties.push({ kind: 'VisualRoleProperty', name: word, expression, span: scanner.span(itemStart) });
  }

  if (!scanner.match('}')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '}' to close local role '@${name}'.`, scanner.span(start))
    );
  }

  return { kind: 'VisualRoleDeclaration', name, uses, properties, states, span: scanner.span(start) };
}

function parseRoleComposition(
  scanner: Scanner,
  diagnostics: Diagnostic[],
  roleName: string
): string[] {
  const uses: string[] = [];
  for (let index = 0; index < 'uses'.length; index += 1) scanner.advance();

  while (!scanner.isAtEnd) {
    scanner.skipInlineWhitespace();
    const itemStart = scanner.position();
    if (!scanner.match('@')) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidVisualRoleDeclaration,
          `Role '@${roleName}' composition must reference roles as '@name'.`,
          scanner.span(itemStart)
        )
      );
      recoverUntil(scanner, [',', '{']);
    } else {
      const used = scanner.readIdentifier();
      if (!used) {
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.InvalidVisualRoleDeclaration,
            `Expected a role name after '@' in the composition of '@${roleName}'.`,
            scanner.span(itemStart)
          )
        );
      } else {
        uses.push(used);
      }
    }

    scanner.skipInlineWhitespace();
    if (scanner.peek() === ',') {
      scanner.advance();
      continue;
    }
    break;
  }

  return uses;
}

function parseRoleState(
  scanner: Scanner,
  start: SourcePosition,
  diagnostics: Diagnostic[]
): VisualRoleStateNode {
  scanner.skipInlineWhitespace();
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  const arguments_ = scanner.peek() === '(' ? parseConditionArguments(scanner, diagnostics, name) : [];
  scanner.skipWhitespaceAndComments();

  const condition: VisualConditionNode = {
    kind: 'VisualCondition',
    name,
    arguments: arguments_,
    span: scanner.span(start)
  };

  if (!name || !scanner.match('{')) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.InvalidVisualRoleDeclaration,
        "Expected 'when <condition> { ... }' inside a visual role.",
        scanner.span(start)
      )
    );
    return { kind: 'VisualRoleState', name, condition, properties: [], span: scanner.span(start) };
  }

  const properties: VisualRolePropertyNode[] = [];
  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === '}') break;

    const propertyStart = scanner.position();
    const propertyName = scanner.readIdentifier();
    scanner.skipInlineWhitespace();

    if (!propertyName || !scanner.match(':')) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidVisualRoleDeclaration,
          `Expected a visual property inside condition '${name}'.`,
          scanner.span(propertyStart)
        )
      );
      scanner.advanceUntil('\n');
      continue;
    }

    scanner.skipInlineWhitespace();
    const expression = readLineExpression(scanner, ['}']);
    properties.push({ kind: 'VisualRoleProperty', name: propertyName, expression, span: scanner.span(propertyStart) });
  }

  if (!scanner.match('}')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '}' to close visual condition '${name}'.`, scanner.span(start))
    );
  }

  return { kind: 'VisualRoleState', name, condition, properties, span: scanner.span(start) };
}

function parseConditionArguments(
  scanner: Scanner,
  diagnostics: Diagnostic[],
  conditionName: string
): VisualConditionArgumentNode[] {
  const args: VisualConditionArgumentNode[] = [];
  scanner.advance();

  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === ')') {
      scanner.advance();
      return args;
    }

    const start = scanner.position();
    const probe = scanner.position();
    const possibleName = scanner.readIdentifier();
    scanner.skipInlineWhitespace();

    let name: string | undefined;
    if (possibleName && scanner.match(':')) {
      name = possibleName;
      scanner.skipInlineWhitespace();
    } else {
      restore(scanner, probe);
    }

    const expression = readLineExpression(scanner, [',', ')']);
    if (!expression.text.trim()) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidVisualRoleArgument,
          `Condition '${conditionName}' contains an empty argument.`,
          scanner.span(start)
        )
      );
    } else {
      args.push({ kind: 'VisualConditionArgument', ...(name ? { name } : {}), expression, span: scanner.span(start) });
    }

    scanner.skipInlineWhitespace();
    if (scanner.peek() === ',') {
      scanner.advance();
      continue;
    }
    if (scanner.peek() === ')') {
      scanner.advance();
      return args;
    }
  }

  diagnostics.push(
    createDiagnostic(
      DiagnosticCodes.ExpectedToken,
      `Expected ')' to close visual condition '${conditionName}'.`,
      scanner.span(scanner.position())
    )
  );
  return args;
}

function recoverUntil(scanner: Scanner, chars: string[]): void {
  while (!scanner.isAtEnd && !chars.includes(scanner.peek())) scanner.advance();
}

function skipBalancedRoleDeclaration(scanner: Scanner): void {
  while (!scanner.isAtEnd && scanner.peek() !== '{' && scanner.peek() !== '\n') scanner.advance();
  if (!scanner.match('{')) {
    scanner.advanceUntil('\n');
    return;
  }

  let depth = 1;
  while (!scanner.isAtEnd && depth > 0) {
    const char = scanner.advance();
    if (char === '{') depth++;
    if (char === '}') depth--;
  }
}
