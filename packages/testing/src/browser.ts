export interface BrowserScreenshotOptions {
  fullPage?: boolean;
  animations?: 'allow' | 'disabled';
  caret?: 'hide' | 'initial';
}

export interface BrowserDriver {
  goto(url: string): Promise<void>;
  evaluate<T, TArgument = undefined>(callback: (argument: TArgument) => T | Promise<T>, argument: TArgument): Promise<T>;
  screenshot(options?: BrowserScreenshotOptions): Promise<Uint8Array>;
  close?(): Promise<void>;
}

export interface BrowserScenario<T> {
  id: string;
  url: string;
  prepare?(driver: BrowserDriver, signal: AbortSignal): void | Promise<void>;
  execute(driver: BrowserDriver, signal: AbortSignal): T | Promise<T>;
  validate?(value: T): void | Promise<void>;
}

export interface BrowserScenarioResult<T> {
  id: string;
  durationMs: number;
  value: T;
}

export async function runBrowserScenario<T>(
  driver: BrowserDriver,
  scenario: BrowserScenario<T>,
  options: { signal?: AbortSignal; timeoutMs?: number; close?: boolean } = {}
): Promise<BrowserScenarioResult<T>> {
  const controller = new AbortController();
  const unlink = linkAbort(options.signal, controller);
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const started = now();
  try {
    await withTimeout(driver.goto(scenario.url), timeoutMs, controller);
    await withTimeout(Promise.resolve(scenario.prepare?.(driver, controller.signal)), timeoutMs, controller);
    const value = await withTimeout(Promise.resolve(scenario.execute(driver, controller.signal)), timeoutMs, controller);
    await withTimeout(Promise.resolve(scenario.validate?.(value)), timeoutMs, controller);
    return Object.freeze({ id: scenario.id, durationMs: now() - started, value });
  } finally {
    unlink();
    if (options.close) await driver.close?.();
  }
}

export async function assertStableBrowserSnapshot(
  driver: BrowserDriver,
  options: BrowserScreenshotOptions = {}
): Promise<Uint8Array> {
  const first = await driver.screenshot({ animations: 'disabled', caret: 'hide', ...options });
  const second = await driver.screenshot({ animations: 'disabled', caret: 'hide', ...options });
  if (first.length !== second.length) throw new Error('Browser screenshots have different byte lengths.');
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) throw new Error(`Browser screenshot changed at byte ${index}.`);
  }
  return first;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Browser scenario exceeded ${timeoutMs} ms.`);
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

function normalizeTimeout(value: number | undefined): number {
  const resolved = value ?? 30_000;
  if (!Number.isFinite(resolved) || resolved <= 0) throw new TypeError('Browser timeout must be a positive number.');
  return resolved;
}
function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }
