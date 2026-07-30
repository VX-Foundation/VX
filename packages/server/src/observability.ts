import type { ServerLogRecord, ServerLogger, ServerSpan, ServerTrace, ServerTraceAttribute } from './types.js';

export interface LoggerOptions {
  sink?: (record: ServerLogRecord) => void;
  baseFields?: Readonly<Record<string, unknown>>;
  requestId?: string;
}

export function createLogger(options: LoggerOptions = {}): ServerLogger {
  const sink = options.sink ?? defaultSink;
  const emit = (level: ServerLogRecord['level'], message: string, error?: unknown, fields?: Readonly<Record<string, unknown>>): void => {
    sink({
      level,
      message,
      timestamp: Date.now(),
      ...(options.requestId ? { requestId: options.requestId } : {}),
      fields: Object.freeze({ ...(options.baseFields ?? {}), ...(fields ?? {}) }),
      ...(error !== undefined ? { error } : {})
    });
  };
  return {
    debug: (message, fields) => emit('debug', message, undefined, fields),
    info: (message, fields) => emit('info', message, undefined, fields),
    warn: (message, fields) => emit('warn', message, undefined, fields),
    error: (message, error, fields) => emit('error', message, error, fields)
  };
}

export function createTrace(onSpan?: (span: Readonly<{ name: string; startedAt: number; endedAt: number; status: 'ok' | 'error'; attributes: Readonly<Record<string, ServerTraceAttribute>>; exceptions: readonly unknown[] }>) => void): ServerTrace {
  return {
    startSpan(name, initial = {}) {
      const startedAt = performance.now();
      const attributes: Record<string, ServerTraceAttribute> = { ...initial };
      const exceptions: unknown[] = [];
      let ended = false;
      const span: ServerSpan = {
        name,
        startedAt,
        setAttribute(key, value) { if (!ended) attributes[key] = value; },
        recordException(error) { if (!ended) exceptions.push(error); },
        end(status = exceptions.length ? 'error' : 'ok') {
          if (ended) return;
          ended = true;
          onSpan?.(Object.freeze({ name, startedAt, endedAt: performance.now(), status, attributes: Object.freeze({ ...attributes }), exceptions: Object.freeze([...exceptions]) }));
        }
      };
      return span;
    }
  };
}

function defaultSink(record: ServerLogRecord): void {
  const payload = JSON.stringify({ ...record, error: normalizeError(record.error) });
  if (record.level === 'error') console.error(payload);
  else if (record.level === 'warn') console.warn(payload);
  else if (record.level === 'debug') console.debug(payload);
  else console.info(payload);
}

function normalizeError(error: unknown): unknown {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return error;
}
