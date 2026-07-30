export interface DeterministicRandom {
  next(): number;
  integer(minimum: number, maximum: number): number;
  boolean(probability?: number): boolean;
  pick<T>(values: readonly T[]): T;
  bytes(length: number): Uint8Array;
}
export function createDeterministicRandom(seed: number): DeterministicRandom {
  let state = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    integer(minimum, maximum) {
      if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) throw new TypeError('Invalid deterministic integer range.');
      return minimum + Math.floor(next() * (maximum - minimum + 1));
    },
    boolean(probability = 0.5) { if (probability < 0 || probability > 1) throw new TypeError('Probability must be between 0 and 1.'); return next() < probability; },
    pick(values) { if (values.length === 0) throw new RangeError('Cannot pick from an empty collection.'); return values[Math.floor(next() * values.length)]!; },
    bytes(length) { if (!Number.isSafeInteger(length) || length < 0) throw new TypeError('Byte length must be a non-negative safe integer.'); return Uint8Array.from({ length }, () => Math.floor(next() * 256)); }
  };
}
