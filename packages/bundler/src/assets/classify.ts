import path from 'node:path';
import type { AssetKind } from './types.js';

const IMAGE = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const FONT = new Set(['.eot', '.otf', '.ttc', '.ttf', '.woff', '.woff2']);
const VIDEO = new Set(['.m4v', '.mkv', '.mov', '.mp4', '.ogv', '.webm']);
const AUDIO = new Set(['.aac', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav']);
const DOCUMENT = new Set(['.html', '.json', '.map', '.txt', '.xml']);

export function classifyAsset(filePath: string): AssetKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.svg') return filePath.toLowerCase().includes('icon') ? 'icon' : 'svg';
  if (IMAGE.has(extension)) return 'image';
  if (FONT.has(extension)) return 'font';
  if (VIDEO.has(extension)) return 'video';
  if (AUDIO.has(extension)) return 'audio';
  if (extension === '.css') return 'css';
  if (extension === '.wasm') return 'wasm';
  if (extension === '.worker' || /(?:^|[.-])worker\.(?:m?js|ts)$/i.test(filePath)) return 'worker';
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return 'script';
  if (DOCUMENT.has(extension)) return 'document';
  return 'other';
}

export function mediaTypeFor(filePath: string): string | undefined {
  const extension = path.extname(filePath).toLowerCase();
  return MEDIA_TYPES[extension];
}

const MEDIA_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.aac': 'audio/aac', '.avif': 'image/avif', '.css': 'text/css', '.eot': 'application/vnd.ms-fontobject',
  '.flac': 'audio/flac', '.gif': 'image/gif', '.html': 'text/html', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.js': 'text/javascript', '.json': 'application/json', '.m4a': 'audio/mp4', '.mjs': 'text/javascript', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.oga': 'audio/ogg', '.ogg': 'audio/ogg', '.ogv': 'video/ogg',
  '.opus': 'audio/opus', '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf',
  '.txt': 'text/plain', '.wasm': 'application/wasm', '.wav': 'audio/wav', '.webm': 'video/webm', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.xml': 'application/xml'
});
