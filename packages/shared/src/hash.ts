import { createHash } from 'node:crypto';

export function hashContent(content: string, length = 8): string {
  if (length <= 0) {
    throw new RangeError('Hash length must be at least one character.');
  }

  return createHash('sha256').update(content).digest('hex').slice(0, length);
}
