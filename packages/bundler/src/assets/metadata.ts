import path from 'node:path';
import { mediaTypeFor } from './classify.js';
import type { AssetMetadata } from './types.js';

export function inspectAssetMetadata(filePath: string, bytes: Uint8Array): AssetMetadata | undefined {
  const extension = path.extname(filePath).toLowerCase();
  const size = imageDimensions(extension, bytes);
  const mediaType = mediaTypeFor(filePath);
  const format = extension.slice(1) || undefined;
  if (!size && !mediaType && !format) return undefined;
  return {
    ...(size ? { width: size.width, height: size.height } : {}),
    ...(format ? { format } : {}),
    ...(mediaType ? { mediaType } : {})
  };
}

function imageDimensions(extension: string, bytes: Uint8Array): { width: number; height: number } | undefined {
  if (extension === '.png' && bytes.length >= 24 && ascii(bytes, 1, 3) === 'PNG') {
    return { width: u32(bytes, 16), height: u32(bytes, 20) };
  }
  if (extension === '.gif' && bytes.length >= 10 && ascii(bytes, 0, 3) === 'GIF') {
    return { width: u16le(bytes, 6), height: u16le(bytes, 8) };
  }
  if (extension === '.webp' && bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return webpDimensions(bytes);
  }
  if (extension === '.jpg' || extension === '.jpeg') return jpegDimensions(bytes);
  if (extension === '.svg') return svgDimensions(new TextDecoder().decode(bytes));
  return undefined;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1] ?? 0;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) return undefined;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0), width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0) };
    }
    offset += length;
  }
  return undefined;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const kind = ascii(bytes, 12, 4);
  if (kind === 'VP8X' && bytes.length >= 30) {
    return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  }
  if (kind === 'VP8L' && bytes.length >= 25) {
    const b1 = bytes[21] ?? 0, b2 = bytes[22] ?? 0, b3 = bytes[23] ?? 0, b4 = bytes[24] ?? 0;
    return { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) };
  }
  return undefined;
}

function svgDimensions(source: string): { width: number; height: number } | undefined {
  const open = source.match(/<svg\b[^>]*>/i)?.[0];
  if (!open) return undefined;
  const width = numericAttribute(open, 'width');
  const height = numericAttribute(open, 'height');
  if (width && height) return { width, height };
  const viewBox = open.match(/\bviewBox\s*=\s*["']\s*[-+\d.eE]+[\s,]+[-+\d.eE]+[\s,]+([-+\d.eE]+)[\s,]+([-+\d.eE]+)\s*["']/i);
  if (!viewBox) return undefined;
  const parsedWidth = Number(viewBox[1]);
  const parsedHeight = Number(viewBox[2]);
  return Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight) && parsedWidth > 0 && parsedHeight > 0
    ? { width: parsedWidth, height: parsedHeight }
    : undefined;
}

function numericAttribute(source: string, name: string): number | undefined {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*["']\\s*([+\\-\\d.eE]+)`,'i'));
  const value = match?.[1] === undefined ? NaN : Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
function u16le(bytes: Uint8Array, offset: number): number { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8); }
function u24le(bytes: Uint8Array, offset: number): number { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16); }
function u32(bytes: Uint8Array, offset: number): number { return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0; }
