import type { OfficialTestCase, OfficialTestReport, OfficialTestResult, TestContext, TestDiagnostic, TestRunOptions } from './types.js';

export interface OfficialTestSuite {
  readonly name: string;
  readonly tests: readonly OfficialTestCase[];
  add(test: OfficialTestCase): OfficialTestSuite;
  run(options?: TestRunOptions): Promise<OfficialTestReport>;
}

export function createTestSuite(name: string): OfficialTestSuite {
  const tests: OfficialTestCase[] = [];
  return {
    name,
    get tests() { return tests; },
    add(test) {
      if (!test.id.trim()) throw new TypeError('VX tests require a stable non-empty id.');
      if (tests.some((entry) => entry.id === test.id)) throw new TypeError(`Duplicate VX test id '${test.id}'.`);
      tests.push(Object.freeze({ ...test }));
      return this;
    },
    async run(options = {}) {
      return runTests(tests, options);
    }
  };
}

export async function runTests(input: readonly OfficialTestCase[], options: TestRunOptions = {}): Promise<OfficialTestReport> {
  const started = now();
  const startedAt = new Date().toISOString();
  const results: OfficialTestResult[] = [];
  for (const test of [...input].sort((left, right) => left.id.localeCompare(right.id))) {
    if (options.filter && !options.filter(test)) {
      results.push(baseResult(test, 'skipped', 0, 0, []));
      continue;
    }
    if (options.signal?.aborted) {
      results.push(baseResult(test, 'cancelled', 0, 0, []));
      continue;
    }
    results.push(await runTest(test, options));
  }
  const durationMs = now() - started;
  return Object.freeze({
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    cancelled: results.filter((result) => result.status === 'cancelled').length,
    results: Object.freeze(results)
  });
}

async function runTest(test: OfficialTestCase, options: TestRunOptions): Promise<OfficialTestResult> {
  const started = now();
  const retries = normalizeNonNegative(test.retries, 0, 'retries');
  const timeoutMs = normalizePositive(test.timeoutMs ?? options.timeoutMs, 30_000, 'timeoutMs');
  let attempts = 0;
  let finalError: unknown;
  let finalDiagnostics: TestDiagnostic[] = [];
  while (attempts <= retries) {
    attempts += 1;
    const diagnostics: TestDiagnostic[] = [];
    const cleanups: Array<() => void | Promise<void>> = [];
    const controller = new AbortController();
    const unlink = linkAbort(options.signal, controller);
    const context: TestContext = {
      signal: controller.signal,
      attempt: attempts,
      diagnostic(diagnostic) { diagnostics.push(Object.freeze({ ...diagnostic })); },
      cleanup(disposer) { cleanups.push(disposer); }
    };
    try {
      await withTimeout(Promise.resolve(test.run(context)), timeoutMs, controller);
      await dispose(cleanups);
      unlink();
      return baseResult(test, controller.signal.aborted ? 'cancelled' : 'passed', now() - started, attempts, diagnostics);
    } catch (error) {
      finalError = error;
      finalDiagnostics = diagnostics;
      controller.abort(error);
      try { await dispose(cleanups); } catch (cleanupError) {
        finalDiagnostics.push({ code: 'VX_TEST_CLEANUP_FAILED', severity: 'error', message: normalizeError(cleanupError).message });
      }
      unlink();
      if (options.signal?.aborted) return baseResult(test, 'cancelled', now() - started, attempts, finalDiagnostics, finalError);
    }
  }
  return baseResult(test, 'failed', now() - started, attempts, finalDiagnostics, finalError);
}

function baseResult(test: OfficialTestCase, status: OfficialTestResult['status'], durationMs: number, attempts: number, diagnostics: readonly TestDiagnostic[], error?: unknown): OfficialTestResult {
  const normalized = error === undefined ? undefined : normalizeError(error);
  return Object.freeze({
    id: test.id, name: test.name, kind: test.kind, status, durationMs, attempts,
    diagnostics: Object.freeze([...diagnostics]),
    ...(normalized ? { error: normalized } : {})
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`VX test exceeded ${timeoutMs} ms.`);
          error.name = 'TimeoutError';
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function linkAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  if (source.aborted) target.abort(source.reason);
  const listener = () => target.abort(source.reason);
  source.addEventListener('abort', listener, { once: true });
  return () => source.removeEventListener('abort', listener);
}

async function dispose(cleanups: Array<() => void | Promise<void>>): Promise<void> {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.reverse()) {
    try { await cleanup(); } catch (error) { errors.push(error); }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'One or more VX test cleanups failed.');
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) };
  return { name: 'Error', message: String(error) };
}
function normalizePositive(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) throw new TypeError(`${name} must be a positive number.`);
  return resolved;
}
function normalizeNonNegative(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) throw new TypeError(`${name} must be a non-negative safe integer.`);
  return resolved;
}
function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }
