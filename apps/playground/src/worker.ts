/// <reference lib="webworker" />

import { inspectVX } from '@vx/tooling/inspect';

interface CompileMessage {
  type: 'COMPILE';
  payload: { source: string };
}

self.onmessage = (event: MessageEvent<CompileMessage>) => {
  if (event.data.type !== 'COMPILE') return;
  try {
    const inspection = inspectVX(event.data.payload.source, 'playground.vx', true);
    const error = inspection.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
    if (error) throw new Error(`${error.code}: ${error.message}`);
    self.postMessage({ type: 'COMPILED', payload: inspection });
  } catch (error: unknown) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: error instanceof Error ? error.message : 'Unexpected VX playground compilation failure.' }
    });
  }
};
