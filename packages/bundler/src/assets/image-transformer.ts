import type { ImageTransformer } from './types.js';

interface SharpPipeline {
  resize(options: Readonly<Record<string, unknown>>): SharpPipeline;
  toFormat(format: string, options?: Readonly<Record<string, unknown>>): SharpPipeline;
  toBuffer(): Promise<Uint8Array>;
}

type SharpFactory = (input: Uint8Array, options?: Readonly<Record<string, unknown>>) => SharpPipeline;

/**
 * Creates the official responsive-image transformer when the optional `sharp`
 * package is available. VX keeps the codec optional so edge-only and library
 * workspaces do not inherit native dependencies they never use.
 */
export async function createSharpImageTransformer(): Promise<ImageTransformer> {
  const specifier = 'sharp';
  let loaded: unknown;
  try { loaded = await import(specifier); }
  catch (cause) {
    throw new Error('Responsive image resizing requires the optional `sharp` package. Install it in the application workspace or provide a custom ImageTransformer.', { cause });
  }
  const module = loaded as { default?: unknown };
  const factory = (typeof module.default === 'function' ? module.default : loaded) as SharpFactory;
  if (typeof factory !== 'function') throw new TypeError('The installed `sharp` module does not expose a compatible image factory.');
  return async ({ source, width, format, quality }) => {
    const pipeline = factory(source, { failOn: 'error', limitInputPixels: 268_402_689 })
      .resize({ width, withoutEnlargement: true, fit: 'inside' })
      .toFormat(format, formatOptions(format, quality));
    return await pipeline.toBuffer();
  };
}

function formatOptions(format: string, quality: number): Readonly<Record<string, unknown>> {
  if (format === 'png') return Object.freeze({ compressionLevel: 9, adaptiveFiltering: true });
  if (format === 'avif') return Object.freeze({ quality, effort: 6 });
  if (format === 'webp') return Object.freeze({ quality, effort: 5, smartSubsample: true });
  if (format === 'jpeg' || format === 'jpg') return Object.freeze({ quality, mozjpeg: true, progressive: true });
  return Object.freeze({ quality });
}
