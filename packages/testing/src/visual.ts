export interface VisualComparisonOptions { channelThreshold?: number; changedPixelRatio?: number; includeDiff?: boolean; }
export interface VisualComparisonResult {
  matched: boolean;
  width: number;
  height: number;
  changedPixels: number;
  changedPixelRatio: number;
  maximumChannelDelta: number;
  diff?: Uint8ClampedArray;
}

export function compareRgbaSnapshots(actual: Uint8ClampedArray, expected: Uint8ClampedArray, width: number, height: number, options: VisualComparisonOptions = {}): VisualComparisonResult {
  const expectedLength = width * height * 4;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new TypeError('Visual snapshot dimensions must be positive safe integers.');
  if (actual.length !== expectedLength || expected.length !== expectedLength) throw new RangeError(`RGBA snapshots must contain exactly ${expectedLength} channels.`);
  const channelThreshold = normalizeRatio(options.channelThreshold, 0);
  const allowedRatio = normalizeRatio(options.changedPixelRatio, 0);
  const diff = options.includeDiff ? new Uint8ClampedArray(expectedLength) : undefined;
  let changedPixels = 0;
  let maximumChannelDelta = 0;
  for (let offset = 0; offset < expectedLength; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs((actual[offset + channel] ?? 0) - (expected[offset + channel] ?? 0));
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
      if (delta / 255 > channelThreshold) changed = true;
    }
    if (changed) changedPixels += 1;
    if (diff) {
      diff[offset] = changed ? 255 : 0;
      diff[offset + 1] = 0;
      diff[offset + 2] = 0;
      diff[offset + 3] = changed ? 255 : 0;
    }
  }
  const ratio = changedPixels / (width * height);
  return Object.freeze({ matched: ratio <= allowedRatio, width, height, changedPixels, changedPixelRatio: ratio, maximumChannelDelta, ...(diff ? { diff } : {}) });
}

function normalizeRatio(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) throw new TypeError('Visual thresholds must be between 0 and 1.');
  return resolved;
}
