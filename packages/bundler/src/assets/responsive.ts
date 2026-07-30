import path from 'node:path';
import { contentHash, integrityHash } from './hash.js';
import type { ImageTransformer, IntegrityAlgorithm, ResponsiveImageRequest, ResponsiveImageVariant } from './types.js';

export async function generateResponsiveImageVariants(
  request: ResponsiveImageRequest,
  source: Uint8Array,
  outputDirectory: string,
  publicBase: string,
  transformer: ImageTransformer,
  integrity: IntegrityAlgorithm | false
): Promise<readonly ResponsiveImageVariant[]> {
  const widths = [...new Set(request.widths)].sort((a, b) => a - b);
  if (widths.length === 0 || widths.some((width) => !Number.isSafeInteger(width) || width <= 0)) {
    throw new TypeError('Responsive image widths must contain positive safe integers.');
  }
  const formats = request.formats?.length ? [...new Set(request.formats.map(normalizeFormat))] : [normalizeFormat(path.extname(request.sourcePath).slice(1))];
  const quality = request.quality ?? 80;
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) throw new TypeError('Responsive image quality must be between 1 and 100.');
  const fs = await import('node:fs/promises');
  await fs.mkdir(outputDirectory, { recursive: true });
  const variants: ResponsiveImageVariant[] = [];
  for (const width of widths) for (const format of formats) {
    const transformed = await transformer({ source, sourcePath: request.sourcePath, width, format, quality });
    const hash = contentHash(transformed);
    const base = path.basename(request.sourcePath, path.extname(request.sourcePath)).replace(/[^A-Za-z0-9_.-]+/g, '-');
    const fileName = `${base}-${width}w-${hash}.${format}`;
    await fs.writeFile(path.join(outputDirectory, fileName), transformed);
    variants.push({
      width,
      format,
      outputPath: `${publicBase.replace(/^\/+|\/+$/g, '')}/${fileName}`,
      publicPath: `${publicBase.replace(/\/$/, '')}/${fileName}`,
      bytes: transformed.byteLength,
      ...(integrity ? { integrity: integrityHash(transformed, integrity) } : {})
    });
  }
  return Object.freeze(variants);
}

export function responsiveSrcSet(variants: readonly ResponsiveImageVariant[], format?: string): string {
  return variants
    .filter((variant) => !format || variant.format === normalizeFormat(format))
    .sort((a, b) => a.width - b.width)
    .map((variant) => `${variant.publicPath} ${variant.width}w`)
    .join(', ');
}

function normalizeFormat(format: string): string {
  const value = format.toLowerCase().replace(/^\./, '');
  if (!/^[a-z0-9]+$/.test(value)) throw new TypeError(`Invalid responsive image format '${format}'.`);
  return value === 'jpg' ? 'jpeg' : value;
}
