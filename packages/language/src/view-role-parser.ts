import type {
  Diagnostic,
  SourcePosition,
  VisualConditionArgumentNode,
  VisualConditionNode,
  VisualKeyframeStepNode,
  VisualPseudoBlockNode,
  VisualRoleArgumentNode,
  VisualRoleDeclarationNode,
  VisualRolePropertyNode,
  VisualRoleStateNode,
  VisualRoleUseNode,
  VisualSelectorBlockNode
} from '@vx-foundation/types';

import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { readLineExpression } from './expression.js';
import type { Scanner } from './scanner.js';

export function parseAttachedRoles(scanner: Scanner, diagnostics: Diagnostic[]): VisualRoleUseNode[] {
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

export function parseRoleDeclaration(scanner: Scanner, diagnostics: Diagnostic[], exported = false): VisualRoleDeclarationNode {
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

function restore(scanner: Scanner, position: SourcePosition): void {
  const internal = scanner as unknown as { offset: number; line: number; column: number; baseOffset: number };
  internal.offset = position.offset - internal.baseOffset;
  internal.line = position.line;
  internal.column = position.column;
}

function recoverUntil(scanner: Scanner, chars: string[]): void {
  while (!scanner.isAtEnd && !chars.includes(scanner.peek())) scanner.advance();
}

export function skipBalancedRoleDeclaration(scanner: Scanner): void {
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
