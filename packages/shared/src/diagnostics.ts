import type { Diagnostic, SourcePosition } from '@vx-foundation/types';

function formatPosition(position: SourcePosition): string {
  return `${position.line}:${position.column}`;
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const start = formatPosition(diagnostic.span.start);
  const end = formatPosition(diagnostic.span.end);
  const header = `[${diagnostic.severity.toUpperCase()}] ${diagnostic.code}`;
  const location = `${diagnostic.span.filePath}:${start}-${end}`;
  const suggestion = diagnostic.suggestion ? `\nSuggestion: ${diagnostic.suggestion}` : '';
  const notes =
    diagnostic.notes && diagnostic.notes.length > 0
      ? `\nNotes:\n- ${diagnostic.notes.join('\n- ')}`
      : '';

  return `${header} ${diagnostic.message}\n${location}${suggestion}${notes}`;
}

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map(formatDiagnostic).join('\n\n');
}
