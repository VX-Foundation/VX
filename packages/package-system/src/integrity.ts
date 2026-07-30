import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type IntegrityAlgorithm = 'sha256' | 'sha384' | 'sha512';

export function createIntegrity(content: string | Uint8Array, algorithm: IntegrityAlgorithm = 'sha512'): string {
  return `${algorithm}-${createHash(algorithm).update(content).digest('base64')}`;
}

export function createFileIntegrity(path: string, algorithm: IntegrityAlgorithm = 'sha512'): string {
  return createIntegrity(readFileSync(path), algorithm);
}

export function verifyIntegrity(content: string | Uint8Array, integrity: string): boolean {
  const separator = integrity.indexOf('-');
  if (separator <= 0) return false;
  const algorithm = integrity.slice(0, separator);
  if (algorithm !== 'sha256' && algorithm !== 'sha384' && algorithm !== 'sha512') return false;
  const expected = createIntegrity(content, algorithm);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(integrity);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function parseIntegrity(integrity: string): { algorithm: IntegrityAlgorithm; digest: Uint8Array } | undefined {
  const separator = integrity.indexOf('-');
  if (separator <= 0) return undefined;
  const algorithm = integrity.slice(0, separator);
  if (algorithm !== 'sha256' && algorithm !== 'sha384' && algorithm !== 'sha512') return undefined;
  try {
    const digest = Buffer.from(integrity.slice(separator + 1), 'base64');
    const expectedLength = algorithm === 'sha256' ? 32 : algorithm === 'sha384' ? 48 : 64;
    return digest.length === expectedLength ? { algorithm, digest } : undefined;
  } catch { return undefined; }
}
