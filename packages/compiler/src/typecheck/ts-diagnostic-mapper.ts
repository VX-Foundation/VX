import ts from 'typescript';
import type { Diagnostic, SourceSpan } from '@vx-foundation/types';
import type { VirtualSpanMapping } from './virtual-ts.js';

/**
 * Maps a TypeScript compiler diagnostic to a VX Diagnostic using virtual source mappings.
 */
export function mapTSDiagnostic(
  tsDiagnostic: ts.Diagnostic,
  mappings: VirtualSpanMapping[],
  fallbackSpan: SourceSpan
): Diagnostic {
  const message = ts.flattenDiagnosticMessageText(tsDiagnostic.messageText, '\n');
  const code = `TS${tsDiagnostic.code}`;
  let span = fallbackSpan;

  if (tsDiagnostic.start !== undefined && tsDiagnostic.length !== undefined) {
    const start = tsDiagnostic.start;
    const end = start + tsDiagnostic.length;

    // Find matching span mapping
    const match = mappings.find((m) => start >= m.virtualStart && end <= m.virtualEnd);
    if (match) {
      span = match.originalSpan;
    }
  }

  return {
    code,
    message: `TypeScript: ${message}`,
    severity: tsDiagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
    span
  };
}
