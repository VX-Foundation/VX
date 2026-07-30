import path from 'node:path';

/** Performs deterministic, lossless optimization without platform-specific codecs. */
export function optimizeAsset(filePath: string, source: Uint8Array): Uint8Array {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.svg') return optimizeSvg(source);
  if (extension === '.png') return stripPngMetadata(source);
  if (extension === '.jpg' || extension === '.jpeg') return stripJpegMetadata(source);
  return source;
}

function optimizeSvg(source: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(source)
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/[\t\r\n]+/g, ' ')
    .trim();
  return new TextEncoder().encode(text);
}

function stripPngMetadata(source: Uint8Array): Uint8Array {
  if (source.length < 12 || source[0] !== 0x89 || source[1] !== 0x50 || source[2] !== 0x4e || source[3] !== 0x47) return source;
  const chunks: Uint8Array[] = [source.slice(0, 8)];
  let offset = 8;
  while (offset + 12 <= source.length) {
    const length = readU32(source, offset);
    const end = offset + 12 + length;
    if (end > source.length) return source;
    const type = String.fromCharCode(...source.slice(offset + 4, offset + 8));
    if (!PNG_METADATA.has(type)) chunks.push(source.slice(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  return concat(chunks);
}

function stripJpegMetadata(source: Uint8Array): Uint8Array {
  if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) return source;
  const chunks: Uint8Array[] = [source.slice(0, 2)];
  let offset = 2;
  while (offset < source.length) {
    if (source[offset] !== 0xff || offset + 1 >= source.length) return source;
    const marker = source[offset + 1] ?? 0;
    if (marker === 0xda) { chunks.push(source.slice(offset)); break; }
    if (marker === 0xd9) { chunks.push(source.slice(offset, offset + 2)); break; }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      chunks.push(source.slice(offset, offset + 2)); offset += 2; continue;
    }
    if (offset + 4 > source.length) return source;
    const length = ((source[offset + 2] ?? 0) << 8) | (source[offset + 3] ?? 0);
    const end = offset + 2 + length;
    if (length < 2 || end > source.length) return source;
    if (marker !== 0xe1 && marker !== 0xfe) chunks.push(source.slice(offset, end));
    offset = end;
  }
  return concat(chunks);
}

const PNG_METADATA = new Set(['tEXt', 'zTXt', 'iTXt', 'tIME', 'eXIf']);
function readU32(bytes: Uint8Array, offset: number): number { return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0; }
function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
