import type { DevtoolsEvent, DevtoolsTransport } from './protocol.js';

export function createWindowTransport(channel = 'vx-devtools'): DevtoolsTransport {
  const listeners = new Set<(event: DevtoolsEvent) => void>();
  const receive = (message: MessageEvent): void => {
    if (message.source !== window || !isEnvelope(message.data, channel)) return;
    for (const listener of [...listeners]) listener(message.data.event);
  };
  window.addEventListener('message', receive);
  return {
    send(event) { window.postMessage({ channel, event }, window.location.origin); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

function isEnvelope(value: unknown, channel: string): value is { channel: string; event: DevtoolsEvent } {
  return Boolean(value) && typeof value === 'object' && (value as Record<string, unknown>)['channel'] === channel && Boolean((value as Record<string, unknown>)['event']);
}
