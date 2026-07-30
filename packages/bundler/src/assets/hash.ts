import { createHash } from 'node:crypto';
import type { IntegrityAlgorithm } from './types.js';

export function contentHash(content: Uint8Array, length = 16): string {
  return createHash('sha256').update(content).digest('hex').slice(0, length);
}

export function integrityHash(content: Uint8Array, algorithm: IntegrityAlgorithm): string {
  return `${algorithm}-${createHash(algorithm).update(content).digest('base64')}`;
}

export function stableId(value: string): string {
  return createHash('sha256').update(value.replaceAll('\\', '/')).digest('hex').slice(0, 20);
}
