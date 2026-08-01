import type { Diagnostic, DiagnosticSeverity, SourceSpan } from '@vx-foundation/types';

/**
 * Collects and formats diagnostics during the compilation's Analyze pass.
 * This ensures that multiple errors can be reported without halting the compiler prematurely.
 */
export class DiagnosticCollector {
  private diagnostics: Diagnostic[] = [];

  /**
   * Internal helper to add a diagnostic.
   */
  private add(
    severity: DiagnosticSeverity,
    code: string,
    message: string,
    span: SourceSpan,
    suggestion?: string,
    notes?: string[]
  ) {
    const diag: Diagnostic = {
      code,
      message,
      severity,
      span,
    };
    if (suggestion !== undefined) diag.suggestion = suggestion;
    if (notes !== undefined) diag.notes = notes;
    this.diagnostics.push(diag);
  }

  /**
   * Reports a compilation error that will ultimately fail the build.
   * Examples: Reactive cycles, invalid server/client boundary access.
   */
  public error(code: string, message: string, span: SourceSpan, suggestion?: string, notes?: string[]) {
    this.add('error', code, message, span, suggestion, notes);
  }

  /**
   * Reports a compilation warning.
   */
  public warning(code: string, message: string, span: SourceSpan, suggestion?: string, notes?: string[]) {
    this.add('warning', code, message, span, suggestion, notes);
  }

  /**
   * Returns all collected diagnostics.
   */
  public getDiagnostics(): Diagnostic[] {
    return this.diagnostics;
  }

  /**
   * Returns true if there are any error-level diagnostics.
   */
  public hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === 'error');
  }
}
