import type { DeterministicRandom } from './random.js';
export type ByteMutator = (input: Uint8Array, random: DeterministicRandom, maximumBytes: number) => Uint8Array;
export const defaultByteMutators: readonly ByteMutator[] = Object.freeze([
  flipBit,
  insertBytes,
  removeRange,
  duplicateRange,
  replaceWithBoundary
]);
function flipBit(input: Uint8Array, random: DeterministicRandom): Uint8Array {
  if (input.length === 0) return Uint8Array.of(1);
  const output = input.slice(); const index = random.integer(0, output.length - 1); output[index] = (output[index] ?? 0) ^ (1 << random.integer(0, 7)); return output;
}
function insertBytes(input: Uint8Array, random: DeterministicRandom, maximumBytes: number): Uint8Array {
  if (input.length >= maximumBytes) return flipBit(input, random);
  const count = random.integer(1, Math.min(16, maximumBytes - input.length));
  const offset = random.integer(0, input.length); const output = new Uint8Array(input.length + count);
  output.set(input.slice(0, offset), 0); output.set(random.bytes(count), offset); output.set(input.slice(offset), offset + count); return output;
}
function removeRange(input: Uint8Array, random: DeterministicRandom): Uint8Array {
  if (input.length === 0) return input;
  const start = random.integer(0, input.length - 1); const end = random.integer(start + 1, input.length);
  const output = new Uint8Array(input.length - (end - start)); output.set(input.slice(0, start)); output.set(input.slice(end), start); return output;
}
function duplicateRange(input: Uint8Array, random: DeterministicRandom, maximumBytes: number): Uint8Array {
  if (input.length === 0 || input.length >= maximumBytes) return input;
  const start = random.integer(0, input.length - 1); const end = Math.min(input.length, start + random.integer(1, Math.min(16, input.length - start)));
  const chunk = input.slice(start, end); const keep = chunk.slice(0, maximumBytes - input.length); const output = new Uint8Array(input.length + keep.length);
  output.set(input); output.set(keep, input.length); return output;
}
function replaceWithBoundary(input: Uint8Array, random: DeterministicRandom): Uint8Array {
  const boundaries = [0, 1, 9, 10, 13, 32, 34, 39, 60, 62, 91, 93, 123, 125, 127, 255];
  if (input.length === 0) return Uint8Array.of(random.pick(boundaries));
  const output = input.slice(); output[random.integer(0, output.length - 1)] = random.pick(boundaries); return output;
}
