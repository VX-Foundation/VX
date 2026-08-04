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
  WidgetProperty,
  VisualKeyframeStepNode,
  VisualPseudoBlockNode,
  VisualSelectorBlockNode
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

function parseRoleDeclaration(scanner: Scanner, diagnostics: Diagnostic[], exported = false): VisualRoleDeclarationNode {
  const start = scanner.position();
  scanner.advance(); // consume '@'
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
    return { kind: 'VisualRoleDeclaration', name, uses, properties: [], states: [], exported, span: scanner.span(start) };
  }

  const properties: VisualRolePropertyNode[] = [];
  const states: VisualRoleStateNode[] = [];
  const keyframes: VisualKeyframeStepNode[] = [];
  const pseudos: VisualPseudoBlockNode[] = [];
  const selectors: VisualSelectorBlockNode[] = [];
  let rawCss: string | undefined;

  // Known pseudo-element keywords
  const PSEUDO_KEYWORDS = new Set(['before', 'after', 'placeholder', 'selection', 'firstLine', 'firstLetter', 'marker', 'backdrop']);
  // Known relational selector combinators
  const SELECTOR_KEYWORDS = new Set(['child', 'has', 'not', 'sibling', 'adjacent', 'is', 'where']);

  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === '}') break;

    const itemStart = scanner.position();
    const word = scanner.readIdentifier();

    // `when <condition> { ... }`
    if (word === 'when') {
      states.push(parseRoleState(scanner, itemStart, diagnostics));
      continue;
    }

    // `keyframes { from { ... } to { ... } 50% { ... } }`
    if (word === 'keyframes') {
      scanner.skipWhitespaceAndComments();
      if (!scanner.match('{')) {
        diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, "Expected '{' after 'keyframes'.", scanner.span(itemStart)));
        scanner.advanceUntil('\n');
        continue;
      }
      while (!scanner.isAtEnd) {
        scanner.skipWhitespaceAndComments();
        if (scanner.peek() === '}') break;
        const stepStart = scanner.position();
        let stop = '';
        // Accept: from, to, or a number (percentage)
        if (scanner.lookingAt('from')) { for (let i = 0; i < 4; i++) scanner.advance(); stop = 'from'; }
        else if (scanner.lookingAt('to')) { for (let i = 0; i < 2; i++) scanner.advance(); stop = 'to'; }
        else {
          const digits = scanner.readWhile((c) => /[0-9]/.test(c));
          if (digits && scanner.peek() === '%') { scanner.advance(); stop = digits; }
          else {
            diagnostics.push(createDiagnostic(DiagnosticCodes.InvalidKeyframeStep, `Keyframe step must be 'from', 'to', or a percentage like '50%'. Got '${digits || scanner.peek()}'.`, scanner.span(stepStart)));
            scanner.advanceUntil('\n');
            continue;
          }
        }
        scanner.skipWhitespaceAndComments();
        if (!scanner.match('{')) {
          diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '{' after keyframe stop '${stop}'.`, scanner.span(stepStart)));
          scanner.advanceUntil('\n');
          continue;
        }
        const stepProps: VisualRolePropertyNode[] = [];
        while (!scanner.isAtEnd) {
          scanner.skipWhitespaceAndComments();
          if (scanner.peek() === '}') break;
          const propStart = scanner.position();
          const propName = scanner.readIdentifier();
          scanner.skipInlineWhitespace();
          if (!propName || !scanner.match(':')) {
            diagnostics.push(createDiagnostic(DiagnosticCodes.InvalidVisualRoleDeclaration, `Expected 'property: value' inside keyframe stop '${stop}'.`, scanner.span(propStart)));
            scanner.advanceUntil('\n');
            continue;
          }
          scanner.skipInlineWhitespace();
          const expr = readLineExpression(scanner, ['}']);
          stepProps.push({ kind: 'VisualRoleProperty', name: propName, expression: expr, span: scanner.span(propStart) });
        }
        scanner.match('}');
        keyframes.push({ kind: 'VisualKeyframeStep', stop, properties: stepProps, span: scanner.span(stepStart) });
      }
      scanner.match('}');
      continue;
    }

    // `before { ... }`, `after { ... }`, `placeholder { ... }`, etc.
    if (PSEUDO_KEYWORDS.has(word)) {
      scanner.skipWhitespaceAndComments();
      if (!scanner.match('{')) {
        diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '{' after pseudo-element '${word}'.`, scanner.span(itemStart)));
        scanner.advanceUntil('\n');
        continue;
      }
      const pseudoProps: VisualRolePropertyNode[] = [];
      while (!scanner.isAtEnd) {
        scanner.skipWhitespaceAndComments();
        if (scanner.peek() === '}') break;
        const propStart = scanner.position();
        const propName = scanner.readIdentifier();
        scanner.skipInlineWhitespace();
        if (!propName || !scanner.match(':')) {
          diagnostics.push(createDiagnostic(DiagnosticCodes.InvalidVisualRoleDeclaration, `Expected 'property: value' inside pseudo-element '${word}'.`, scanner.span(propStart)));
          scanner.advanceUntil('\n');
          continue;
        }
        scanner.skipInlineWhitespace();
        const expr = readLineExpression(scanner, ['}']);
        pseudoProps.push({ kind: 'VisualRoleProperty', name: propName, expression: expr, span: scanner.span(propStart) });
      }
      scanner.match('}');
      pseudos.push({ kind: 'VisualPseudoBlock', pseudo: word, properties: pseudoProps, span: scanner.span(itemStart) });
      continue;
    }

    // `child("selector") { ... }`, `has("...") { ... }`, etc.
    if (SELECTOR_KEYWORDS.has(word)) {
      scanner.skipInlineWhitespace();
      let selectorArg = '';
      if (scanner.peek() === '(') {
        scanner.advance(); // consume (
        // Read until closing ) — may contain nested parens
        let depth = 1;
        while (!scanner.isAtEnd && depth > 0) {
          const ch = scanner.peek();
          if (ch === '(') depth++;
          if (ch === ')') { depth--; if (depth === 0) { scanner.advance(); break; } }
          selectorArg += scanner.advance();
        }
        selectorArg = selectorArg.trim();
        // Strip surrounding quotes if present
        if ((selectorArg.startsWith('"') && selectorArg.endsWith('"')) ||
            (selectorArg.startsWith("'") && selectorArg.endsWith("'"))) {
          selectorArg = selectorArg.slice(1, -1);
        }
      } else {
        diagnostics.push(createDiagnostic(DiagnosticCodes.InvalidSelectorCombinator, `Selector combinator '${word}' requires a CSS selector argument, e.g. ${word}("h2") { ... }.`, scanner.span(itemStart)));
        scanner.advanceUntil('\n');
        continue;
      }
      scanner.skipWhitespaceAndComments();
      if (!scanner.match('{')) {
        diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '{' after selector combinator '${word}("${selectorArg}")'.`, scanner.span(itemStart)));
        scanner.advanceUntil('\n');
        continue;
      }
      const selProps: VisualRolePropertyNode[] = [];
      while (!scanner.isAtEnd) {
        scanner.skipWhitespaceAndComments();
        if (scanner.peek() === '}') break;
        const propStart = scanner.position();
        const propName = scanner.readIdentifier();
        scanner.skipInlineWhitespace();
        if (!propName || !scanner.match(':')) {
          diagnostics.push(createDiagnostic(DiagnosticCodes.InvalidVisualRoleDeclaration, `Expected 'property: value' inside selector '${word}'.`, scanner.span(propStart)));
          scanner.advanceUntil('\n');
          continue;
        }
        scanner.skipInlineWhitespace();
        const expr = readLineExpression(scanner, ['}']);
        selProps.push({ kind: 'VisualRoleProperty', name: propName, expression: expr, span: scanner.span(propStart) });
      }
      scanner.match('}');
      selectors.push({ kind: 'VisualSelectorBlock', combinator: word, selector: selectorArg, properties: selProps, span: scanner.span(itemStart) });
      continue;
    }

    // `css { "raw css value" }`
    if (word === 'css') {
      scanner.skipWhitespaceAndComments();
      if (!scanner.match('{')) {
        diagnostics.push(createDiagnostic(DiagnosticCodes.InvalidRawCss, "Expected '{' after 'css'.", scanner.span(itemStart)));
        scanner.advanceUntil('\n');
        continue;
      }
      scanner.skipWhitespaceAndComments();
      // Read the raw CSS string (must be a quoted string)
      const rawStart = scanner.position();
      let rawValue = '';
      if (scanner.peek() === '"' || scanner.peek() === "'") {
        const quote = scanner.advance();
        while (!scanner.isAtEnd && scanner.peek() !== quote) {
          if (scanner.peek() === '\\') { scanner.advance(); rawValue += scanner.advance(); }
          else rawValue += scanner.advance();
        }
        if (scanner.peek() === quote) scanner.advance();
      } else {
        diagnostics.push(createDiagnostic(DiagnosticCodes.InvalidRawCss, "The 'css { }' block requires a quoted CSS string, e.g. css { \"display: grid\" }.", scanner.span(rawStart)));
        recoverUntil(scanner, ['}']);
      }
      scanner.skipWhitespaceAndComments();
      scanner.match('}');
      if (rawValue.trim()) rawCss = (rawCss ? rawCss + '\n  ' : '') + rawValue.trim();
      continue;
    }

    // Regular `property: value`
    scanner.skipInlineWhitespace();
    if (!word || !scanner.match(':')) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidVisualRoleDeclaration,
          `Expected a visual property, 'when', 'keyframes', 'before', 'after', 'css', or a selector combinator inside '@${name}'.`,
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

  return {
    kind: 'VisualRoleDeclaration',
    name,
    uses,
    properties,
    states,
    exported,
    ...(keyframes.length > 0 ? { keyframes } : {}),
    ...(pseudos.length > 0 ? { pseudos } : {}),
    ...(selectors.length > 0 ? { selectors } : {}),
    ...(rawCss !== undefined ? { rawCss } : {}),
    span: scanner.span(start)
  };
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
