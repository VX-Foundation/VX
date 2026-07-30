import type { ExpressionNode } from '@vx/types';

import type { Scanner } from './scanner.js';

/**
 * Every expression captured by the VX parser is stored as raw text plus a
 * source span. Syntax-tree expression analysis, dependency resolution, and
 * client/server validation happen in the compiler. This package only locates
 * expression boundaries while preserving the original source text.
 */

const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
const QUOTES = new Set(['"', "'", '`']);

/** Consumes a `"`, `'` or `` ` `` string literal (with escapes) starting at the current position. */
export function readStringLiteralRaw(scanner: Scanner): string {
  const quote = scanner.peek();
  let text = scanner.advance();

  while (!scanner.isAtEnd) {
    const char = scanner.peek();

    if (char === '\\') {
      text += scanner.advance();
      if (!scanner.isAtEnd) {
        text += scanner.advance();
      }
      continue;
    }

    if (char === quote) {
      text += scanner.advance();
      break;
    }

    text += scanner.advance();
  }

  return text;
}

/** Reads the unescaped contents of a `"..."` string, consuming both quotes. Returns `null` if unterminated. */
export function readStringLiteralValue(scanner: Scanner): string | null {
  if (scanner.peek() !== '"') {
    return null;
  }

  scanner.advance();
  let value = '';

  while (!scanner.isAtEnd && scanner.peek() !== '"') {
    if (scanner.peek() === '\\') {
      scanner.advance();
      value += scanner.advance();
      continue;
    }

    value += scanner.advance();
  }

  if (scanner.peek() !== '"') {
    return null;
  }

  scanner.advance();
  return value;
}

/**
 * Reads an expression delimited by a matching pair of brackets (e.g. `(` … `)`),
 * respecting nested brackets and string literals. Expects the cursor to be
 * positioned at `open` and consumes through the matching `close`.
 */
export function readBracketedExpression(scanner: Scanner, open: string, close: string): ExpressionNode {
  const start = scanner.position();

  if (scanner.peek() !== open) {
    return { kind: 'Expression', text: '', span: scanner.span(start) };
  }

  scanner.advance();
  const innerStart = scanner.position();
  let depth = 1;
  let text = '';

  while (!scanner.isAtEnd && depth > 0) {
    const char = scanner.peek();

    if (QUOTES.has(char)) {
      text += readStringLiteralRaw(scanner);
      continue;
    }

    if (char === open) {
      depth += 1;
      text += scanner.advance();
      continue;
    }

    if (char === close) {
      depth -= 1;
      if (depth === 0) {
        scanner.advance();
        break;
      }
      text += scanner.advance();
      continue;
    }

    text += scanner.advance();
  }

  return { kind: 'Expression', text: text.trim(), span: scanner.span(innerStart, scanner.position()) };
}

export function readParenExpression(scanner: Scanner): ExpressionNode {
  return readBracketedExpression(scanner, '(', ')');
}

/**
 * Reads an expression that ends at a top-level (bracket-depth-zero) newline,
 * or at one of `stopChars` when also at depth zero — used for `#script`
 * declarations such as `state count = 0` or `prop label: string`, which
 * are not wrapped in an explicit delimiter pair.
 */
export function readLineExpression(scanner: Scanner, stopChars: string[] = []): ExpressionNode {
  const start = scanner.position();
  let depth = 0;
  let text = '';

  while (!scanner.isAtEnd) {
    const char = scanner.peek();

    if (depth === 0 && char === '\n') {
      break;
    }

    if (depth === 0 && stopChars.includes(char)) {
      break;
    }

    if (QUOTES.has(char)) {
      text += readStringLiteralRaw(scanner);
      continue;
    }

    if (OPENERS.has(char)) {
      depth += 1;
      text += scanner.advance();
      continue;
    }

    if (CLOSERS.has(char)) {
      depth = Math.max(0, depth - 1);
      text += scanner.advance();
      continue;
    }

    text += scanner.advance();
  }

  return { kind: 'Expression', text: text.trim(), span: scanner.span(start) };
}

/**
 * Reads the raw body of an action, effect, or lifecycle block while
 * respecting nested braces and string literals. The compiler later parses
 * this body as TypeScript syntax for dependencies, security, and lowering.
 */
export function readBraceBody(scanner: Scanner): { body: string; terminated: boolean } {
  if (scanner.peek() !== '{') {
    return { body: '', terminated: false };
  }

  scanner.advance();
  let depth = 1;
  let body = '';

  while (!scanner.isAtEnd && depth > 0) {
    const char = scanner.peek();

    if (QUOTES.has(char)) {
      body += readStringLiteralRaw(scanner);
      continue;
    }

    if (char === '{') {
      depth += 1;
      body += scanner.advance();
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        scanner.advance();
        return { body: body.trim(), terminated: true };
      }
      body += scanner.advance();
      continue;
    }

    body += scanner.advance();
  }

  return { body: body.trim(), terminated: false };
}
