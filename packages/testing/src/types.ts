export type OfficialTestKind =
  | 'unit' | 'component' | 'dom' | 'ssr' | 'hydration' | 'route'
  | 'action' | 'endpoint' | 'browser' | 'visual' | 'accessibility' | 'performance';

export interface TestDiagnostic {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  suggestion?: string;
}

export interface TestContext {
  signal: AbortSignal;
  attempt: number;
  diagnostic(diagnostic: TestDiagnostic): void;
  cleanup(disposer: () => void | Promise<void>): void;
}

export interface OfficialTestCase {
  id: string;
  name: string;
  kind: OfficialTestKind;
  timeoutMs?: number;
  retries?: number;
  run(context: TestContext): void | Promise<void>;
}

export interface OfficialTestResult {
  id: string;
  name: string;
  kind: OfficialTestKind;
  status: 'passed' | 'failed' | 'skipped' | 'cancelled';
  durationMs: number;
  attempts: number;
  diagnostics: readonly TestDiagnostic[];
  error?: { name: string; message: string; stack?: string };
}

export interface OfficialTestReport {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  cancelled: number;
  results: readonly OfficialTestResult[];
}

export interface TestRunOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  filter?: (test: OfficialTestCase) => boolean;
}
