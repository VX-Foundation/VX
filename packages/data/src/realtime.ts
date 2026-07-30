import type { QueryClient } from '@vx/runtime';

export interface RealtimeMessage<T = unknown> {
  id: string;
  topic: string;
  type: string;
  data: T;
  timestamp: number;
  tags?: readonly string[];
}

export interface RealtimeConnection {
  send(value: string): void;
  close(code?: number, reason?: string): void;
  onMessage(listener: (value: string) => void): () => void;
  onClose(listener: (event?: unknown) => void): () => void;
  onError(listener: (error: unknown) => void): () => void;
}

export interface RealtimeTransport {
  readonly duplex?: boolean;
  connect(input: { url: string; protocols?: string | string[]; signal: AbortSignal; resumeFrom?: string }): Promise<RealtimeConnection>;
}

export interface RealtimeClientOptions {
  url: string;
  transport: RealtimeTransport;
  queryClient?: QueryClient;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  heartbeatMs?: number;
  maxBufferedMessages?: number;
  backpressure?: 'reject' | 'drop-oldest';
  protocols?: string | string[];
  onError?: (error: unknown) => void;
}

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export class RealtimeClient {
  private readonly subscriptions = new Map<string, Set<(message: RealtimeMessage) => void>>();
  private readonly buffer: string[] = [];
  private connection: RealtimeConnection | undefined;
  private controller: AbortController | undefined;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private lastEventId: string | undefined;
  private _status: RealtimeStatus = 'idle';

  constructor(private readonly options: RealtimeClientOptions) {}

  get status(): RealtimeStatus { return this._status; }

  async connect(): Promise<void> {
    if (this._status === 'open' || this._status === 'connecting') return;
    this.clearReconnect();
    this.controller = new AbortController();
    this._status = this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
    try {
      const connection = await this.options.transport.connect({
        url: this.options.url,
        signal: this.controller.signal,
        ...(this.options.protocols ? { protocols: this.options.protocols } : {}),
        ...(this.lastEventId ? { resumeFrom: this.lastEventId } : {})
      });
      if (this.controller.signal.aborted) {
        connection.close(1000, 'Cancelled');
        return;
      }
      this.connection = connection;
      this.reconnectAttempt = 0;
      this._status = 'open';
      connection.onMessage((value) => this.receive(value));
      connection.onClose(() => this.handleClose());
      connection.onError((error) => this.options.onError?.(error));
      this.flushBuffer();
      this.startHeartbeat();
    } catch (error) {
      this.options.onError?.(error);
      this.handleClose();
      throw error;
    }
  }

  disconnect(): void {
    this.controller?.abort(new DOMException('Realtime client disconnected', 'AbortError'));
    this.controller = undefined;
    this.connection?.close(1000, 'Client disconnect');
    this.connection = undefined;
    this.clearReconnect();
    this.stopHeartbeat();
    this._status = 'closed';
  }

  subscribe<T>(topic: string, listener: (message: RealtimeMessage<T>) => void): () => void {
    const listeners = this.subscriptions.get(topic) ?? new Set();
    listeners.add(listener as (message: RealtimeMessage) => void);
    this.subscriptions.set(topic, listeners);
    if (listeners.size === 1 && this.options.transport.duplex !== false) this.publish('vx:subscribe', { topic });
    return () => {
      listeners.delete(listener as (message: RealtimeMessage) => void);
      if (listeners.size === 0) {
        this.subscriptions.delete(topic);
        if (this.options.transport.duplex !== false) this.publish('vx:unsubscribe', { topic });
      }
    };
  }

  setPresence(topic: string, data: unknown): void {
    this.publish(topic, data, 'presence');
  }

  publish(topic: string, data: unknown, type = 'message'): void {
    const value = JSON.stringify({ id: randomId(), topic, type, data, timestamp: Date.now() });
    if (this.connection && this._status === 'open') {
      this.connection.send(value);
      return;
    }
    const limit = Math.max(1, this.options.maxBufferedMessages ?? 100);
    if (this.buffer.length >= limit) {
      if ((this.options.backpressure ?? 'reject') === 'reject') throw new Error('Realtime outbound buffer is full.');
      this.buffer.shift();
    }
    this.buffer.push(value);
  }

  private receive(value: string): void {
    let message: RealtimeMessage;
    try { message = validateMessage(JSON.parse(value) as unknown); }
    catch (error) { this.options.onError?.(error); return; }
    this.lastEventId = message.id;
    if (message.tags?.length) this.options.queryClient?.invalidateTags(message.tags);
    for (const listener of this.subscriptions.get(message.topic) ?? []) listener(message);
    for (const listener of this.subscriptions.get('*') ?? []) listener(message);
  }

  private handleClose(): void {
    this.connection = undefined;
    this.stopHeartbeat();
    if (this._status === 'closed' || this.controller?.signal.aborted) return;
    if (this.options.reconnect === false) {
      this._status = 'closed';
      return;
    }
    this._status = 'reconnecting';
    this.reconnectAttempt += 1;
    const base = Math.max(50, this.options.reconnectDelayMs ?? 500);
    const max = Math.max(base, this.options.maxReconnectDelayMs ?? 30_000);
    const delay = Math.min(max, base * 2 ** Math.max(0, this.reconnectAttempt - 1));
    this.reconnectTimer = setTimeout(() => void this.connect().catch(() => undefined), delay);
  }

  private flushBuffer(): void {
    while (this.connection && this.buffer.length > 0) this.connection.send(this.buffer.shift()!);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (this.options.transport.duplex === false) return;
    const interval = this.options.heartbeatMs ?? 30_000;
    if (interval <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      try { this.publish('vx:heartbeat', { at: Date.now() }, 'heartbeat'); }
      catch (error) { this.options.onError?.(error); }
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
}

export class WebSocketTransport implements RealtimeTransport {
  readonly duplex = true;
  async connect(input: { url: string; protocols?: string | string[]; signal: AbortSignal; resumeFrom?: string }): Promise<RealtimeConnection> {
    if (typeof WebSocket === 'undefined') throw new Error('WebSocket is unavailable in this runtime.');
    const url = new URL(input.url);
    if (input.resumeFrom) url.searchParams.set('vx_resume', input.resumeFrom);
    const socket = new WebSocket(url, input.protocols);
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        socket.close(1000, 'Cancelled');
        reject(input.signal.reason);
      };
      if (input.signal.aborted) return abort();
      input.signal.addEventListener('abort', abort, { once: true });
      socket.addEventListener('open', () => { input.signal.removeEventListener('abort', abort); resolve(); }, { once: true });
      socket.addEventListener('error', () => { input.signal.removeEventListener('abort', abort); reject(new Error('WebSocket connection failed.')); }, { once: true });
    });
    return {
      send: (value) => socket.send(value),
      close: (code, reason) => socket.close(code, reason),
      onMessage(listener) {
        const handler = (event: MessageEvent): void => listener(String(event.data));
        socket.addEventListener('message', handler);
        return () => socket.removeEventListener('message', handler);
      },
      onClose(listener) {
        const handler = (event: CloseEvent): void => listener(event);
        socket.addEventListener('close', handler);
        return () => socket.removeEventListener('close', handler);
      },
      onError(listener) {
        const handler = (event: Event): void => listener(event);
        socket.addEventListener('error', handler);
        return () => socket.removeEventListener('error', handler);
      }
    };
  }
}


export class EventSourceTransport implements RealtimeTransport {
  readonly duplex = false;

  async connect(input: { url: string; signal: AbortSignal; resumeFrom?: string }): Promise<RealtimeConnection> {
    if (typeof EventSource === 'undefined') throw new Error('EventSource is unavailable in this runtime.');
    const url = new URL(input.url);
    if (input.resumeFrom) url.searchParams.set('vx_resume', input.resumeFrom);
    const source = new EventSource(url);
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        source.close();
        reject(input.signal.reason);
      };
      if (input.signal.aborted) return abort();
      input.signal.addEventListener('abort', abort, { once: true });
      source.addEventListener('open', () => { input.signal.removeEventListener('abort', abort); resolve(); }, { once: true });
      source.addEventListener('error', () => { input.signal.removeEventListener('abort', abort); reject(new Error('EventSource connection failed.')); }, { once: true });
    });
    return {
      send() { throw new Error('EventSource transport is receive-only.'); },
      close() { source.close(); },
      onMessage(listener) {
        const handler = (event: MessageEvent): void => listener(String(event.data));
        source.addEventListener('message', handler);
        return () => source.removeEventListener('message', handler);
      },
      onClose(listener) {
        const handler = (): void => listener();
        source.addEventListener('error', handler);
        return () => source.removeEventListener('error', handler);
      },
      onError(listener) {
        const handler = (event: Event): void => listener(event);
        source.addEventListener('error', handler);
        return () => source.removeEventListener('error', handler);
      }
    };
  }
}

function validateMessage(value: unknown): RealtimeMessage {
  if (!value || typeof value !== 'object') throw new TypeError('Realtime message must be an object.');
  const message = value as Partial<RealtimeMessage>;
  if (typeof message.id !== 'string' || typeof message.topic !== 'string' || typeof message.type !== 'string') {
    throw new TypeError('Realtime message requires string id, topic, and type values.');
  }
  return {
    id: message.id,
    topic: message.topic,
    type: message.type,
    data: message.data,
    timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
    ...(Array.isArray(message.tags) ? { tags: message.tags.filter((tag): tag is string => typeof tag === 'string') } : {})
  };
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
