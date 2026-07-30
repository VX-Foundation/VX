export interface PerformanceSample { durationMs: number; }
export interface PerformanceStatistics {
  iterations: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  minimumMs: number;
  maximumMs: number;
  samples: readonly PerformanceSample[];
}
export interface PerformanceBudget { meanMs?: number; medianMs?: number; p95Ms?: number; maximumMs?: number; }
export interface PerformanceBudgetResult { passed: boolean; violations: readonly string[]; statistics: PerformanceStatistics; }

export async function measurePerformance(operation: () => void | Promise<void>, options: { warmup?: number; iterations?: number; signal?: AbortSignal } = {}): Promise<PerformanceStatistics> {
  const warmup = integer(options.warmup, 5, 'warmup', 0);
  const iterations = integer(options.iterations, 25, 'iterations', 1);
  for (let index = 0; index < warmup; index += 1) await operation();
  const samples: PerformanceSample[] = [];
  for (let index = 0; index < iterations; index += 1) {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    const started = now();
    await operation();
    samples.push({ durationMs: now() - started });
  }
  const values = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const sum = values.reduce((total, value) => total + value, 0);
  return Object.freeze({
    iterations,
    meanMs: sum / iterations,
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    minimumMs: values[0] ?? 0,
    maximumMs: values[values.length - 1] ?? 0,
    samples: Object.freeze(samples)
  });
}

export function enforcePerformanceBudget(statistics: PerformanceStatistics, budget: PerformanceBudget): PerformanceBudgetResult {
  const violations: string[] = [];
  compare(violations, 'mean', statistics.meanMs, budget.meanMs);
  compare(violations, 'median', statistics.medianMs, budget.medianMs);
  compare(violations, 'p95', statistics.p95Ms, budget.p95Ms);
  compare(violations, 'maximum', statistics.maximumMs, budget.maximumMs);
  return Object.freeze({ passed: violations.length === 0, violations: Object.freeze(violations), statistics });
}

function compare(output: string[], name: string, actual: number, limit: number | undefined): void { if (limit !== undefined && actual > limit) output.push(`${name} ${actual.toFixed(3)} ms exceeded ${limit.toFixed(3)} ms.`); }
function percentile(values: readonly number[], ratio: number): number { if (values.length === 0) return 0; return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))] ?? 0; }
function integer(value: number | undefined, fallback: number, name: string, minimum: number): number { const resolved = value ?? fallback; if (!Number.isSafeInteger(resolved) || resolved < minimum) throw new TypeError(`${name} must be a safe integer greater than or equal to ${minimum}.`); return resolved; }
function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }
