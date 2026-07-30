import type { BenchmarkSample } from './protocol.js';
export interface BenchmarkStatistics { count: number; mean: number; median: number; p75: number; p95: number; minimum: number; maximum: number; standardDeviation: number; }
export function summarizeSamples(samples: readonly BenchmarkSample[]): BenchmarkStatistics {
  if (samples.length === 0) throw new RangeError('Cannot summarize an empty benchmark sample set.');
  const metric = samples[0]?.metric;
  if (samples.some((sample) => sample.metric !== metric || !Number.isFinite(sample.value) || sample.value < 0)) throw new TypeError('Benchmark samples must use one metric and finite non-negative values.');
  const values = samples.map((sample) => sample.value).sort((left, right) => left - right);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Object.freeze({ count: values.length, mean, median: percentile(values, 0.5), p75: percentile(values, 0.75), p95: percentile(values, 0.95), minimum: values[0] ?? 0, maximum: values[values.length - 1] ?? 0, standardDeviation: Math.sqrt(variance) });
}
export function relativeDifference(candidate: number, baseline: number): number { if (!Number.isFinite(candidate) || !Number.isFinite(baseline) || baseline <= 0) throw new TypeError('Relative comparisons require finite values and a positive baseline.'); return (candidate - baseline) / baseline; }
function percentile(values: readonly number[], ratio: number): number { return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))] ?? 0; }
