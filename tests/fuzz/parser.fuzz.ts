import { describe, expect, it } from 'vitest';
import { parse } from '@vx/language';

function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value ^ (value >>> 15), 1 | value) + 0x6D2B79F5) >>> 0) / 4294967296;
}

describe('VX parser property suite', () => {
  it('returns diagnostics instead of throwing for deterministic malformed input', () => {
    const next = random(991);
    const alphabet = '#@{}[]():,\n abcdefghijklmnopqrstuvwxyz0123456789"';
    for (let caseIndex = 0; caseIndex < 300; caseIndex += 1) {
      const length = Math.floor(next() * 2048);
      let source = '';
      for (let index = 0; index < length; index += 1) source += alphabet[Math.floor(next() * alphabet.length)];
      expect(() => parse(source, `/fuzz/${caseIndex}.vx`)).not.toThrow();
      expect(parse(source, `/fuzz/${caseIndex}.vx`).diagnostics).toBeInstanceOf(Array);
    }
  });
});
