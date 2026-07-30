import type { Diagnostic, LifecycleDirective, LifecycleDirectiveName } from '@vx/types';
import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { type Scanner } from './scanner.js';
import { recoverToNextLine } from './script-parser-utils.js';

const LIFECYCLE_NAMES: readonly LifecycleDirectiveName[] = ['mount', 'unmount', 'update'];

export function parseLifecycleDirective(scanner: Scanner, diagnostics: Diagnostic[]): LifecycleDirective {
  const start = scanner.position();
  scanner.advance(); // consume '@'
  const name = scanner.readIdentifier();

  if (!LIFECYCLE_NAMES.includes(name as LifecycleDirectiveName)) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.UnknownDataStatement,
        `Unknown lifecycle directive '@${name}'. Expected one of: ${LIFECYCLE_NAMES.map((n) => `@${n}`).join(', ')}.`,
        scanner.span(start)
      )
    );
  }

  recoverToNextLine(scanner);
  scanner.skipWhitespaceAndComments();

  const { body, terminated } = readUntilDirectiveEnd(scanner, name);

  if (!terminated) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.UnterminatedLifecycleBlock,
        `'@${name}' is never closed with '@end ${name}'.`,
        scanner.span(start)
      )
    );
  }

  return {
    kind: 'LifecycleDirective',
    name: name as LifecycleDirectiveName,
    side: 'client',
    body,
    span: scanner.span(start)
  };
}

function readUntilDirectiveEnd(scanner: Scanner, name: string): { body: string; terminated: boolean } {
  let body = '';

  while (!scanner.isAtEnd) {
    if (scanner.matchDirectiveEnd(name)) {
      return { body: body.trim(), terminated: true };
    }

    if (scanner.peek() === '"' || scanner.peek() === "'" || scanner.peek() === '`') {
      const quote = scanner.peek();
      body += scanner.advance();
      while (!scanner.isAtEnd && scanner.peek() !== quote) {
        if (scanner.peek() === '\\') {
          body += scanner.advance();
          if (!scanner.isAtEnd) {
            body += scanner.advance();
          }
          continue;
        }
        body += scanner.advance();
      }
      if (!scanner.isAtEnd) {
        body += scanner.advance();
      }
      continue;
    }

    body += scanner.advance();
  }

  return { body: body.trim(), terminated: false };
}
