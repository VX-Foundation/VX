import type { DeclarationVisibility, Diagnostic, ExecutionSide, SourcePosition, StateStatement } from '@vx/types';
import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { Scanner } from './scanner.js';
import {
  parseContentDeclaration,
  parseContextInjectDeclaration,
  parseContextProvideDeclaration,
  parseForwardDeclaration,
  parseGenericDeclaration,
  parseImportDeclaration,
  parseModelDeclaration,
  parseOutputDeclaration,
  parseVisualPartDeclaration
} from './component-contract-parser.js';
import { parseAction, parseEffect, parseQuery, parseStore } from './script-data-parser.js';
import { parseLifecycleDirective } from './script-lifecycle-parser.js';
import { recoverToNextLine } from './script-parser-utils.js';
import { parseFormDeclaration, parseSchemaDeclaration } from './script-schema-parser.js';
import { parseComputed, parseConst, parseProp, parseState } from './script-state-parser.js';

const SCRIPT_KEYWORDS = ['import', 'generic', 'prop', 'model', 'schema', 'form', 'provide', 'inject', 'forward', 'const', 'state', 'derive', 'query', 'action', 'effect', 'store', 'output', 'content', 'part'] as const;

/**
 * Parses the contents of a `#script … #end script` block into the `StateStatement[]`
 * shape defined in `@vx/types`, following the grammar in docs/spec/reactive-execution.md.
 *
 * Data declarations may be client-owned or explicitly server-owned. The
 * execution side is recorded on the declaration so semantic analysis can
 * validate query policies, store lifetimes, captures, and transport boundaries.
 */
export function parseScriptBlock(
  source: string,
  filePath: string,
  base: SourcePosition
): { statements: StateStatement[]; diagnostics: Diagnostic[] } {
  const scanner = new Scanner(source, filePath, base);
  const statements: StateStatement[] = [];
  const diagnostics: Diagnostic[] = [];

  for (;;) {
    scanner.skipWhitespaceAndComments();
    if (scanner.isAtEnd) {
      break;
    }

    const start = scanner.position();

    if (scanner.peek() === '@') {
      statements.push(parseLifecycleDirective(scanner, diagnostics));
      continue;
    }

    let side: ExecutionSide = 'client';
    let visibility: DeclarationVisibility = 'private';
    let word = scanner.readIdentifier();
    const modifiers = new Set<string>();

    while (word === 'server' || word === 'export') {
      if (modifiers.has(word)) {
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.SyntaxError,
            `Duplicate '${word}' modifier in #script declaration.`,
            scanner.span(start)
          )
        );
      }
      modifiers.add(word);
      if (word === 'server') side = 'server';
      if (word === 'export') visibility = 'public';
      scanner.skipInlineWhitespace();
      word = scanner.readIdentifier();
    }

    const push = <T extends StateStatement>(statement: T): void => {
      if (visibility === 'public') statement.visibility = 'public';
      statements.push(statement);
    };

    switch (word) {
      case 'import':
        push(parseImportDeclaration(scanner, side, start, diagnostics));
        break;
      case 'generic':
        push(parseGenericDeclaration(scanner, side, start, diagnostics));
        break;
      case 'model':
        push(parseModelDeclaration(scanner, side, start, diagnostics));
        break;
      case 'schema':
        push(parseSchemaDeclaration(scanner, side, start, diagnostics));
        break;
      case 'form':
        push(parseFormDeclaration(scanner, side, start, diagnostics));
        break;
      case 'provide':
        push(parseContextProvideDeclaration(scanner, side, start, diagnostics));
        break;
      case 'inject':
        push(parseContextInjectDeclaration(scanner, side, start, diagnostics));
        break;
      case 'forward':
        push(parseForwardDeclaration(scanner, side, start, diagnostics));
        break;
      case 'output':
        push(parseOutputDeclaration(scanner, side, start, diagnostics));
        break;
      case 'content':
        push(parseContentDeclaration(scanner, side, start, diagnostics));
        break;
      case 'part':
        push(parseVisualPartDeclaration(scanner, side, start, diagnostics));
        break;
      case 'prop':
        push(parseProp(scanner, side, start));
        break;
      case 'const':
        push(parseConst(scanner, side, start));
        break;
      case 'state':
        push(parseState(scanner, side, start));
        break;
      case 'derive':
        push(parseComputed(scanner, side, start));
        break;
      case 'query':
        push(parseQuery(scanner, side, start, diagnostics));
        break;
      case 'action':
        push(parseAction(scanner, side, start, diagnostics));
        break;
      case 'effect':
        push(parseEffect(scanner, side, start, diagnostics));
        break;
      case 'reaction':
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.SupersededScriptStatement,
            "'reaction' has been superseded by 'effect'.",
            scanner.span(start),
            { suggestion: "Replace 'reaction { ... }' with 'effect { ... }'." }
          )
        );
        parseEffect(scanner, side, start, diagnostics);
        break;
      case 'store':
        push(parseStore(scanner, side, start, diagnostics));
        break;
      default:
        diagnostics.push(
          createDiagnostic(
            DiagnosticCodes.UnknownDataStatement,
            `Unknown '#script' statement '${word || scanner.peek()}'. Expected one of: ${SCRIPT_KEYWORDS.join(', ')}, or a lifecycle directive.`,
            scanner.span(start)
          )
        );
        recoverToNextLine(scanner);
    }
  }

  return { statements, diagnostics };
}
