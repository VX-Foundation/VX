import { defaultByteMutators, type ByteMutator } from './mutators.js';
import { createDeterministicRandom } from './random.js';
export interface FuzzCrash { iteration: number; seed: number; input: Uint8Array; minimizedInput: Uint8Array; error: { name: string; message: string; stack?: string }; }
export interface FuzzReport { seed: number; iterations: number; executions: number; corpusSize: number; durationMs: number; crashes: readonly FuzzCrash[]; }
export interface FuzzCampaignOptions {
  seed?: number;
  iterations?: number;
  maximumBytes?: number;
  timeoutMs?: number;
  corpus: readonly (Uint8Array | string)[];
  target(input: Uint8Array, signal: AbortSignal): void | Promise<void>;
  mutators?: readonly ByteMutator[];
  expectedError?(error: unknown): boolean;
  stopAfterFirstCrash?: boolean;
}
export async function runFuzzCampaign(options: FuzzCampaignOptions): Promise<FuzzReport> {
  const seed = integer(options.seed, 1, 'seed', 0);
  const iterations = integer(options.iterations, 1_000, 'iterations', 1);
  const maximumBytes = integer(options.maximumBytes, 64 * 1024, 'maximumBytes', 1);
  const timeoutMs = integer(options.timeoutMs, 1_000, 'timeoutMs', 1);
  const random = createDeterministicRandom(seed);
  const corpus = options.corpus.map(toBytes).filter((input) => input.length <= maximumBytes);
  if (corpus.length === 0) corpus.push(new Uint8Array());
  const mutators = options.mutators?.length ? options.mutators : defaultByteMutators;
  const crashes: FuzzCrash[] = [];
  const started = now();
  let executions = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    executions += 1;
    const parent = random.pick(corpus);
    const input = random.pick(mutators)(parent, random, maximumBytes).slice(0, maximumBytes);
    const error = await execute(options.target, input, timeoutMs);
    if (!error || options.expectedError?.(error)) {
      if (input.length > 0 && corpus.length < 512 && random.boolean(0.05)) corpus.push(input);
      continue;
    }
    const minimizedInput = await minimize(input, async (candidate) => {
      const candidateError = await execute(options.target, candidate, timeoutMs);
      return candidateError !== undefined && !options.expectedError?.(candidateError);
    });
    crashes.push({ iteration, seed, input, minimizedInput, error: normalizeError(error) });
    if (options.stopAfterFirstCrash ?? true) break;
  }
  return Object.freeze({ seed, iterations, executions, corpusSize: corpus.length, durationMs: now() - started, crashes: Object.freeze(crashes) });
}
async function execute(target: FuzzCampaignOptions['target'], input: Uint8Array, timeoutMs: number): Promise<unknown | undefined> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve(target(input, controller.signal)),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { const error = new Error(`Fuzz target exceeded ${timeoutMs} ms.`); error.name = 'TimeoutError'; controller.abort(error); reject(error); }, timeoutMs); })
    ]);
    return undefined;
  } catch (error) { return error; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
async function minimize(input: Uint8Array, stillFails: (candidate: Uint8Array) => Promise<boolean>): Promise<Uint8Array> {
  let current = input.slice(); let chunk = Math.max(1, Math.floor(current.length / 2));
  while (current.length > 0 && chunk >= 1) {
    let reduced = false;
    for (let offset = 0; offset < current.length; offset += chunk) {
      const candidate = new Uint8Array(Math.max(0, current.length - Math.min(chunk, current.length - offset)));
      candidate.set(current.slice(0, offset)); candidate.set(current.slice(offset + chunk), offset);
      if (await stillFails(candidate)) { current = candidate; reduced = true; break; }
    }
    if (!reduced) chunk = Math.floor(chunk / 2);
  }
  return current;
}
function toBytes(value: Uint8Array | string): Uint8Array { return typeof value === 'string' ? new TextEncoder().encode(value) : value.slice(); }
function normalizeError(error: unknown): FuzzCrash['error'] { if (error instanceof Error) return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) }; return { name: 'Error', message: String(error) }; }
function integer(value: number | undefined, fallback: number, name: string, minimum: number): number { const resolved = value ?? fallback; if (!Number.isSafeInteger(resolved) || resolved < minimum) throw new TypeError(`${name} must be a safe integer greater than or equal to ${minimum}.`); return resolved; }
function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }
