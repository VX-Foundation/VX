import type { BenchmarkAdapter, BenchmarkEnvironment, BenchmarkResult, BenchmarkScenario } from './protocol.js';
export async function runBenchmark(adapter: BenchmarkAdapter, scenario: BenchmarkScenario, environment: BenchmarkEnvironment, options: { warmupIterations?: number; measuredIterations?: number; timeoutMs?: number; signal?: AbortSignal; metadata?: Readonly<Record<string, string | number | boolean>> } = {}): Promise<BenchmarkResult> {
  const warmupIterations = count(options.warmupIterations, 5, 'warmupIterations', 0);
  const measuredIterations = count(options.measuredIterations, 30, 'measuredIterations', 1);
  const timeoutMs = count(options.timeoutMs, 60_000, 'timeoutMs', 1);
  const controller = new AbortController(); const unlink = link(options.signal, controller);
  try {
    await within(Promise.resolve(adapter.prepare?.(scenario, controller.signal)), timeoutMs, controller);
    for (let index = 0; index < warmupIterations; index += 1) await within(Promise.resolve(adapter.execute(scenario, controller.signal)), timeoutMs, controller);
    const samples = [];
    for (let index = 0; index < measuredIterations; index += 1) samples.push(await within(Promise.resolve(adapter.execute(scenario, controller.signal)), timeoutMs, controller));
    return Object.freeze({ schema: 'https://vx.veelv.site/schemas/benchmark-result/v1', suiteVersion: 1, scenario, identity: await adapter.identity(), environment, warmupIterations, measuredIterations, samples: Object.freeze(samples), metadata: Object.freeze({ ...options.metadata }) });
  } finally { unlink(); await adapter.cleanup?.(scenario); }
}
async function within<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { const error = new Error(`Benchmark operation exceeded ${timeoutMs} ms.`); error.name = 'TimeoutError'; controller.abort(error); reject(error); }, timeoutMs); })]); } finally { if (timer !== undefined) clearTimeout(timer); } }
function link(source: AbortSignal | undefined, target: AbortController): () => void { if (!source) return () => undefined; if (source.aborted) target.abort(source.reason); const listener = () => target.abort(source.reason); source.addEventListener('abort', listener, { once: true }); return () => source.removeEventListener('abort', listener); }
function count(value: number | undefined, fallback: number, name: string, minimum: number): number { const resolved = value ?? fallback; if (!Number.isSafeInteger(resolved) || resolved < minimum) throw new TypeError(`${name} must be a safe integer greater than or equal to ${minimum}.`); return resolved; }
