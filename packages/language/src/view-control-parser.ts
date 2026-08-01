import type {
  CollectionFallbackNode,
  Diagnostic,
  ExpressionNode,
  IfBlockNode,
  IfBranchNode,
  IsBranchNode,
  KeyedCollectionNode,
  SourcePosition,
  StructuralTransitionNode,
  TypeExpressionNode,
  ViewNode,
  WhenBlockNode
} from '@vx-foundation/types';

import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { readLineExpression, readParenExpression } from './expression.js';
import type { Scanner } from './scanner.js';
import { parseViewPattern } from './view-pattern.js';

export type ParseViewNodeList = (scanner: Scanner, diagnostics: Diagnostic[]) => ViewNode[];

export function parseIfBlock(
  scanner: Scanner,
  start: SourcePosition,
  diagnostics: Diagnostic[],
  parseChildren: ParseViewNodeList
): IfBlockNode {
  const branches: IfBranchNode[] = [];
  const firstCondition = readRequiredCondition(scanner, diagnostics, 'if');
  const firstChildren = parseRequiredBody(scanner, diagnostics, start, 'if', parseChildren);
  branches.push({ kind: 'IfBranch', condition: firstCondition, children: firstChildren, span: scanner.span(start) });

  while (true) {
    scanner.skipWhitespaceAndComments();
    if (!scanner.matchKeyword('else')) break;

    const branchStart = scanner.position();
    scanner.skipInlineWhitespace();
    if (scanner.matchKeyword('if')) {
      const condition = readRequiredCondition(scanner, diagnostics, 'else if');
      const children = parseRequiredBody(scanner, diagnostics, branchStart, 'else if', parseChildren);
      branches.push({ kind: 'IfBranch', condition, children, span: scanner.span(branchStart) });
      continue;
    }

    const children = parseRequiredBody(scanner, diagnostics, branchStart, 'else', parseChildren);
    branches.push({ kind: 'IfBranch', children, span: scanner.span(branchStart) });
    scanner.skipWhitespaceAndComments();
    if (scanner.lookingAt('else')) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidIfContract,
          'An `else` branch must be the final branch of an if structure.',
          scanner.span(scanner.position())
        )
      );
    }
    break;
  }

  const transition = parseOptionalTransition(scanner, diagnostics);
  return {
    kind: 'IfBlock',
    branches,
    condition: firstCondition,
    children: firstChildren,
    ...(transition ? { transition } : {}),
    span: scanner.span(start)
  };
}

export function parseWhenBlock(
  scanner: Scanner,
  start: SourcePosition,
  diagnostics: Diagnostic[],
  parseChildren: ParseViewNodeList
): WhenBlockNode {
  scanner.skipInlineWhitespace();
  const expression = readLineExpression(scanner, ['{']);
  if (!expression.text.trim()) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.InvalidWhenContract, 'A `when` structure requires a value to match.', expression.span)
    );
  }

  scanner.skipWhitespaceAndComments();
  if (!scanner.match('{')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, "Expected '{' after the when expression.", scanner.span(scanner.position()))
    );
  }

  const branches: IsBranchNode[] = [];
  let fallback: ViewNode[] | undefined;
  let wildcardSeen = false;
  let fallbackSeen = false;
  const patterns = new Set<string>();

  while (!scanner.isAtEnd) {
    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === '}') break;

    const branchStart = scanner.position();
    const word = scanner.readIdentifier();
    if (word === 'else') {
      const nextFallback = parseRequiredBody(scanner, diagnostics, branchStart, 'when else', parseChildren);
      if (fallbackSeen) {
        diagnostics.push(
          createDiagnostic(DiagnosticCodes.DuplicateViewBranch, 'A when structure may declare only one `else` branch.', scanner.span(branchStart))
        );
      }
      if (wildcardSeen) {
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.UnreachableViewBranch,
            'The `else` branch is unreachable because a wildcard pattern appears before it.',
            scanner.span(branchStart)
          )
        );
      }
      if (!fallbackSeen) fallback = nextFallback;
      fallbackSeen = true;
      continue;
    }

    if (word !== 'is') {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidWhenContract,
          "Expected an `is Pattern { ... }` or `else { ... }` branch inside `when`.",
          scanner.span(branchStart),
          { suggestion: 'Use braces for every final Phase 5 match branch.' }
        )
      );
      recoverMalformedBranch(scanner);
      continue;
    }

    scanner.skipInlineWhitespace();
    const patternExpression = readLineExpression(scanner, ['{', ':']);
    const parsed = parseViewPattern(patternExpression.text, patternExpression.span);
    if (!parsed.pattern) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidViewPattern,
          parsed.error ?? 'Invalid view pattern.',
          patternExpression.span
        )
      );
    }

    scanner.skipWhitespaceAndComments();
    if (scanner.peek() === ':') {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.InvalidWhenContract,
          'Colon-based `is Pattern:` branches are superseded by `is Pattern { ... }`.',
          scanner.span(scanner.position()),
          { suggestion: 'Wrap the branch body in braces.' }
        )
      );
      scanner.advance();
    }

    const children = parseRequiredBody(scanner, diagnostics, branchStart, 'when branch', parseChildren);
    if (!parsed.pattern) continue;

    if (fallbackSeen) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.UnreachableViewBranch,
          `Pattern '${parsed.pattern.text}' is unreachable because an else branch appears before it.`,
          parsed.pattern.span
        )
      );
    } else if (wildcardSeen) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.UnreachableViewBranch,
          `Pattern '${parsed.pattern.text}' is unreachable because a wildcard branch appears before it.`,
          parsed.pattern.span
        )
      );
    }
    if (parsed.pattern.category === 'wildcard') wildcardSeen = true;
    const identity = viewPatternIdentity(parsed.pattern);
    if (patterns.has(identity)) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.DuplicateViewBranch,
          `Pattern '${parsed.pattern.text}' is declared more than once in the same when structure.`,
          parsed.pattern.span
        )
      );
    }
    patterns.add(identity);

    const typeAnnotation: TypeExpressionNode = {
      kind: 'TypeExpression',
      text: parsed.pattern.text,
      span: parsed.pattern.span
    };
    branches.push({
      kind: 'IsBranch',
      pattern: parsed.pattern,
      typeAnnotation,
      children,
      span: scanner.span(branchStart)
    });
  }

  if (!scanner.match('}')) {
    diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, "Expected '}' to close the when block.", scanner.span(start)));
  }
  if (branches.length === 0) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.InvalidWhenContract, 'A `when` structure requires at least one `is` branch.', scanner.span(start))
    );
  }

  const transition = parseOptionalTransition(scanner, diagnostics);
  return {
    kind: 'WhenBlock',
    expression,
    branches,
    ...(fallback ? { fallback } : {}),
    ...(transition ? { transition } : {}),
    span: scanner.span(start)
  };
}

export function parseKeyedCollection(
  scanner: Scanner,
  start: SourcePosition,
  diagnostics: Diagnostic[],
  parseChildren: ParseViewNodeList
): KeyedCollectionNode {
  scanner.skipInlineWhitespace();
  const header = readLineExpression(scanner, ['{']);
  const parsedHeader = parseCollectionHeader(header);
  if (!parsedHeader) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.InvalidCollectionContract,
        'Invalid keyed collection header.',
        header.span,
        { suggestion: 'Use `for item, index in collection keyed(item.id) { ... }`.' }
      )
    );
  }

  const children = parseRequiredBody(scanner, diagnostics, start, 'keyed collection', parseChildren);
  const fallbacks: CollectionFallbackNode[] = [];
  const seen = new Set<string>();

  while (true) {
    scanner.skipWhitespaceAndComments();
    const branchStart = scanner.position();
    const branch = scanner.readIdentifier();
    if (branch !== 'loading' && branch !== 'empty' && branch !== 'error') {
      restoreWord(scanner, branchStart, branch);
      break;
    }

    let binding: string | undefined;
    scanner.skipInlineWhitespace();
    if (branch === 'error' && scanner.peek() !== '{') {
      binding = scanner.readIdentifier();
      scanner.skipInlineWhitespace();
      if (!binding) {
        diagnostics.push(
          createDiagnostic(DiagnosticCodes.InvalidCollectionContract, 'Expected an error binding name or `{`.', scanner.span(branchStart))
        );
      }
    }

    const branchChildren = parseRequiredBody(scanner, diagnostics, branchStart, `${branch} collection branch`, parseChildren);
    if (seen.has(branch)) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.DuplicateViewBranch,
          `Collection branch '${branch}' is declared more than once.`,
          scanner.span(branchStart)
        )
      );
    }
    seen.add(branch);
    fallbacks.push({
      kind: 'CollectionFallback',
      branch,
      ...(binding ? { binding } : {}),
      children: branchChildren,
      span: scanner.span(branchStart)
    });
  }

  const transition = parseOptionalTransition(scanner, diagnostics);
  const safeHeader = parsedHeader ?? {
    itemName: '__invalidItem',
    collection: expressionNode('[]', header),
    key: expressionNode('0', header)
  };

  return {
    kind: 'KeyedCollection',
    itemName: safeHeader.itemName,
    ...(safeHeader.indexName ? { indexName: safeHeader.indexName } : {}),
    collection: safeHeader.collection,
    key: safeHeader.key,
    children,
    fallbacks,
    ...(transition ? { transition } : {}),
    span: scanner.span(start)
  };
}


function viewPatternIdentity(pattern: IsBranchNode['pattern']): string {
  if (pattern.category === 'wildcard') return 'wildcard';
  if (pattern.category === 'named') return `named:${pattern.name ?? pattern.text}`;
  return `literal:${typeof pattern.literal}:${String(pattern.literal)}`;
}

function readRequiredCondition(scanner: Scanner, diagnostics: Diagnostic[], label: string): ExpressionNode {
  scanner.skipInlineWhitespace();
  const condition = readLineExpression(scanner, ['{']);
  if (!condition.text.trim()) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.InvalidIfContract, `The ${label} branch requires a condition.`, condition.span)
    );
  }
  return condition;
}

function parseRequiredBody(
  scanner: Scanner,
  diagnostics: Diagnostic[],
  start: SourcePosition,
  label: string,
  parseChildren: ParseViewNodeList
): ViewNode[] {
  scanner.skipWhitespaceAndComments();
  if (!scanner.match('{')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '{' to open the ${label} body.`, scanner.span(scanner.position()))
    );
    return [];
  }

  const children = parseChildren(scanner, diagnostics);
  if (!scanner.match('}')) {
    diagnostics.push(createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '}' to close the ${label} body.`, scanner.span(start)));
  }
  return children;
}

function parseOptionalTransition(scanner: Scanner, diagnostics: Diagnostic[]): StructuralTransitionNode | undefined {
  scanner.skipWhitespaceAndComments();
  const start = scanner.position();
  if (!scanner.matchKeyword('transition')) return undefined;
  scanner.skipInlineWhitespace();
  if (scanner.peek() !== '(') {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.InvalidStructuralTransition,
        'A structural transition must use `transition(expression)`.',
        scanner.span(start)
      )
    );
    return undefined;
  }
  const expression = readParenExpression(scanner);
  if (!expression.text.trim()) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.InvalidStructuralTransition, 'A structural transition expression cannot be empty.', expression.span)
    );
  }
  return { kind: 'StructuralTransition', expression, span: scanner.span(start) };
}

interface ParsedCollectionHeader {
  itemName: string;
  indexName?: string;
  collection: ExpressionNode;
  key: ExpressionNode;
}

function parseCollectionHeader(header: ExpressionNode): ParsedCollectionHeader | undefined {
  const source = header.text.trim();
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?\s+in\s+([\s\S]+)\s+keyed\s*\(([\s\S]+)\)$/.exec(source);
  if (!match) return undefined;

  const itemName = match[1]!;
  const indexName = match[2];
  const collectionText = match[3]!.trim();
  const keyText = match[4]!.trim();
  if (!collectionText || !keyText || itemName === indexName) return undefined;

  return {
    itemName,
    ...(indexName ? { indexName } : {}),
    collection: expressionNode(collectionText, header),
    key: expressionNode(keyText, header)
  };
}

function expressionNode(text: string, source: ExpressionNode): ExpressionNode {
  return { kind: 'Expression', text, span: source.span };
}

function recoverMalformedBranch(scanner: Scanner): void {
  while (!scanner.isAtEnd && scanner.peek() !== '}' && scanner.peek() !== '\n') scanner.advance();
}

function restoreWord(scanner: Scanner, start: SourcePosition, word: string): void {
  if (!word) return;
  scanner.offset -= word.length;
  scanner.line = start.line;
  scanner.column = start.column;
}
