import type { Diagnostic } from '@vx-foundation/types';

import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { Scanner } from './scanner.js';
import { isBlockKind, type Token } from './tokens.js';

const SUPERSEDED_BLOCKS = new Set(['data', 'state', 'logic', 'style']);

/**
 * Resolves the only two component regions currently accepted by VX:
 * `#script` and `#view`.
 *
 * Visual intent belongs to compiler-owned roles inside `#view`; a separate
 * `#style` region is intentionally not part of this revision.
 */
export function tokenize(source: string, filePath: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const scanner = new Scanner(source, filePath);
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let activeBlock: 'script' | 'view' | undefined;

  while (!scanner.isAtEnd) {
    scanner.skipWhitespace();

    if (scanner.isAtEnd) break;

    if (scanner.isAtLineStart() && scanner.lookingAt('#end')) {
      const start = scanner.position();
      scanner.match('#end');
      scanner.skipInlineWhitespace();
      const kindWord = scanner.readIdentifier();

      if (isBlockKind(kindWord)) {
        tokens.push({ type: 'BlockClose', kind: kindWord, span: scanner.span(start) });
        if (activeBlock === kindWord) activeBlock = undefined;
      } else if (SUPERSEDED_BLOCKS.has(kindWord)) {
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.SupersededBlock,
            `Block '#end ${kindWord}' belongs to a superseded VX syntax.`,
            scanner.span(start),
            {
              suggestion:
                kindWord === 'style'
                  ? "Move visual intent into compiler-owned '@roles' inside '#view'."
                  : "Use '#script ... #end script' for component behavior."
            }
          )
        );
      } else {
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.UnknownBlockKind,
            `Unknown block kind '${kindWord || '<empty>'}' after '#end'. Expected 'script' or 'view'.`,
            scanner.span(start)
          )
        );
      }
      continue;
    }

    if (scanner.isAtLineStart() && scanner.peek() === '#') {
      const start = scanner.position();
      scanner.advance();
      const kindWord = scanner.readIdentifier();

      if (isBlockKind(kindWord)) {
        tokens.push({ type: 'BlockOpen', kind: kindWord, span: scanner.span(start) });
        activeBlock = kindWord;
      } else if (SUPERSEDED_BLOCKS.has(kindWord)) {
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.SupersededBlock,
            `Block '#${kindWord}' belongs to a superseded VX syntax.`,
            scanner.span(start),
            {
              suggestion:
                kindWord === 'style'
                  ? "Declare visual roles inside '#view'; VX no longer requires a separate '#style' block."
                  : "Use '#script ... #end script' for component behavior."
            }
          )
        );
      } else {
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.UnknownBlockKind,
            `Unknown block marker '#${kindWord || '<empty>'}'. Expected '#script' or '#view'.`,
            scanner.span(start)
          )
        );
      }
      continue;
    }

    if (!activeBlock && scanner.lookingAt('model ')) {
      const start = scanner.position();
      scanner.match('model ');
      scanner.skipInlineWhitespace();
      const name = scanner.readIdentifier();
      scanner.skipWhitespace();

      if (scanner.peek() === '{') {
        scanner.advance();
        const contentStart = scanner.position();
        let depth = 1;

        while (!scanner.isAtEnd && depth > 0) {
          if (scanner.peek() === '{') depth++;
          if (scanner.peek() === '}') depth--;
          scanner.advance();
        }

        const current = scanner.position();
        const contentEnd = {
          line: current.line,
          column: Math.max(1, current.column - 1),
          offset: Math.max(contentStart.offset, current.offset - 1)
        };
        const content = source.slice(contentStart.offset, contentEnd.offset);

        tokens.push({ type: 'ModelDeclaration', name, content, span: scanner.span(start) });
        continue;
      }

      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.SyntaxError,
          `Expected '{' after model name '${name}'.`,
          scanner.span(start)
        )
      );
    }

    scanner.advance();
  }

  tokens.push({ type: 'EOF', span: scanner.span(scanner.position()) });

  return { tokens, diagnostics };
}
