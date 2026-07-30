import type { Diagnostic, ModelDeclaration, ModelFieldNode, ProgramNode, SourcePosition, TopLevelBlock } from '@vx/types';

import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { Scanner } from './scanner.js';
import { tokenize } from './tokenizer.js';
import type { BlockKind, Token } from './tokens.js';
import { parseScriptBlock } from './script-parser.js';
import { parseViewBlock } from './view-parser.js';

/**
 * Parses a full `.vx` file into a `ProgramNode`.
 *
 * The pipeline is deliberately two-tiered: `tokenize()` resolves models and
 * top-level region boundaries, then each region's raw text is handed to its
 * dedicated sub-parser (`parseScriptBlock` or `parseViewBlock`). This mirrors
 * the current two-region component grammar in docs/spec/README.md.
 */
export function parse(source: string, filePath: string): { ast: ProgramNode; diagnostics: Diagnostic[] } {
  const { tokens, diagnostics: tokenizerDiagnostics } = tokenize(source, filePath);
  const diagnostics: Diagnostic[] = [...tokenizerDiagnostics];
  const blocks: TopLevelBlock[] = [];
  const seenKinds = new Set<BlockKind>();

  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];

    if (!token || token.type === 'EOF') {
      break;
    }

    if (token.type === 'ModelDeclaration') {
      const result = parseModelDeclaration(token.name, token.content, filePath, token.span.start);
      diagnostics.push(...result.diagnostics);
      blocks.push(result.ast);
      index += 1;
      continue;
    }

    if (token.type === 'BlockClose') {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.MismatchedBlockEnd,
          `Unexpected '#end ${token.kind}' without a matching '#${token.kind}' block.`,
          token.span
        )
      );
      index += 1;
      continue;
    }

    const openToken = token;
    const closeIndex = findMatchingClose(tokens, index, openToken.kind);

    if (closeIndex === -1) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.UnterminatedBlock,
          `Block '#${openToken.kind}' is never closed with '#end ${openToken.kind}'.`,
          openToken.span
        )
      );
      index += 1;
      continue;
    }

    const closeToken = tokens[closeIndex];

    if (!closeToken || closeToken.type !== 'BlockClose') {
      index += 1;
      continue;
    }

    if (seenKinds.has(openToken.kind)) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCodes.DuplicateBlock,
          `Duplicate '#${openToken.kind}' block: a file may only declare one '#${openToken.kind}' block.`,
          openToken.span
        )
      );
    }
    seenKinds.add(openToken.kind);

    const contentStart = openToken.span.end;
    const contentEnd = closeToken.span.start;
    const contentText = source.slice(contentStart.offset, contentEnd.offset);
    const blockSpan = { filePath, start: openToken.span.start, end: closeToken.span.end };

    if (openToken.kind === 'script') {
      const result = parseScriptBlock(contentText, filePath, contentStart);
      diagnostics.push(...result.diagnostics);
      blocks.push({ kind: 'ScriptBlock', statements: result.statements, span: blockSpan });
    } else if (openToken.kind === 'view') {
      const result = parseViewBlock(contentText, filePath, contentStart);
      diagnostics.push(...result.diagnostics);
      blocks.push({ kind: 'ViewBlock', children: result.children, roles: result.roles, span: blockSpan });
    }

    index = closeIndex + 1;
  }

  const ast: ProgramNode = {
    kind: 'Program',
    filePath,
    blocks,
    span: { filePath, start: { line: 1, column: 1, offset: 0 }, end: computeEndPosition(source) }
  };

  return { ast, diagnostics };
}

function parseModelDeclaration(name: string, content: string, filePath: string, startPos: SourcePosition): { ast: ModelDeclaration, diagnostics: Diagnostic[] } {
  const scanner = new Scanner(content, filePath, startPos);
  const fields: ModelFieldNode[] = [];
  const diagnostics: Diagnostic[] = [];

  while (!scanner.isAtEnd) {
    scanner.skipWhitespace();
    if (scanner.isAtEnd) break;

    const fieldStart = scanner.position();
    const fieldName = scanner.readIdentifier();
    
    scanner.skipWhitespace();
    if (scanner.peek() !== ':') {
      diagnostics.push(createDiagnostic(DiagnosticCodes.SyntaxError, "Expected ':' after field name in model declaration.", scanner.span(fieldStart)));
      scanner.advanceUntil('\n');
      continue;
    }
    scanner.match(':');
    scanner.skipWhitespace();

    const typeStart = scanner.position();
    const typeText = scanner.readUntil('\n').trim();
    
    if (!typeText) {
      diagnostics.push(createDiagnostic(DiagnosticCodes.SyntaxError, "Expected type annotation after ':'.", scanner.span(typeStart)));
      continue;
    }

    fields.push({
      kind: 'ModelField',
      name: fieldName,
      typeAnnotation: {
        kind: 'TypeExpression',
        text: typeText,
        span: scanner.span(typeStart)
      },
      span: scanner.span(fieldStart)
    });
  }

  return {
    ast: {
      kind: 'ModelDeclaration',
      name,
      fields,
      span: { filePath, start: startPos, end: scanner.position() }
    },
    diagnostics
  };
}

function findMatchingClose(tokens: Token[], openIndex: number, kind: BlockKind): number {
  for (let i = openIndex + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token && token.type === 'BlockClose' && token.kind === kind) {
      return i;
    }
  }
  return -1;
}

function computeEndPosition(source: string): SourcePosition {
  const lines = source.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  return { line: lines.length, column: lastLine.length + 1, offset: source.length };
}
