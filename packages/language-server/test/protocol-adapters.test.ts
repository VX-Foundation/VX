import { describe, expect, it } from 'vitest';
import { CompletionItemKind, DiagnosticSeverity, SymbolKind } from 'vscode-languageserver/node.js';
import { encodeSemanticTokens, resolveWorkspaceRoot, toCompletionItem, toLspDiagnostic, toPosition, toSymbolKind } from '../src/protocol-adapters.js';

describe('language-server protocol adapters', () => {
  it('maps one-based VX locations to zero-based LSP positions', () => {
    expect(toPosition({ line: 3, column: 5 })).toEqual({ line: 2, character: 4 });
  });

  it('maps diagnostics and preserves actionable suggestions', () => {
    const result = toLspDiagnostic({
      severity: 'error', code: 'VX_TEST', message: 'Invalid widget.', suggestion: 'Use View.',
      span: { start: { line: 2, column: 3 }, end: { line: 2, column: 8 } }
    });
    expect(result.severity).toBe(DiagnosticSeverity.Error);
    expect(result.message).toContain('Suggestion: Use View.');
    expect(result.range.start).toEqual({ line: 1, character: 2 });
  });

  it('maps completion and symbol kinds deterministically', () => {
    expect(toCompletionItem({ label: 'Button', kind: 'widget', detail: 'native widget' }).kind).toBe(CompletionItemKind.Class);
    expect(toSymbolKind({ kind: 'action', name: 'save', span: {} as never, selectionSpan: {} as never })).toBe(SymbolKind.Function);
  });

  it('encodes sorted semantic-token deltas and modifiers', () => {
    const data = encodeSemanticTokens([
      { line: 2, column: 4, length: 3, type: 'variable', modifiers: [] },
      { line: 1, column: 1, length: 4, type: 'keyword', modifiers: ['declaration'] }
    ]);
    expect(data).toEqual([0, 0, 4, 0, 1, 1, 3, 3, 4, 0]);
  });

  it('resolves file workspace roots and rejects non-file roots', () => {
    expect(resolveWorkspaceRoot({ workspaceFolders: [{ uri: 'file:///tmp/vx', name: 'vx' }], rootUri: null })).toContain('/tmp/vx');
    expect(resolveWorkspaceRoot({ workspaceFolders: [{ uri: 'https://example.test/vx', name: 'vx' }], rootUri: null })).toBeUndefined();
  });
});
