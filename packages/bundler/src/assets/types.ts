export type AssetKind =
  | 'image'
  | 'font'
  | 'icon'
  | 'svg'
  | 'video'
  | 'audio'
  | 'css'
  | 'worker'
  | 'wasm'
  | 'script'
  | 'document'
  | 'other';

export type IntegrityAlgorithm = 'sha256' | 'sha384' | 'sha512';

export interface AssetMetadata {
  width?: number;
  height?: number;
  format?: string;
  mediaType?: string;
  durationSeconds?: number;
}

export interface AssetRecord {
  id: string;
  sourcePath: string;
  outputPath: string;
  publicPath: string;
  kind: AssetKind;
  bytes: number;
  contentHash: string;
  integrity?: string;
  immutable: boolean;
  critical?: boolean;
  metadata?: AssetMetadata;
  variants?: readonly ResponsiveImageVariant[];
}

export interface ResponsiveImageVariant {
  width: number;
  format: string;
  outputPath: string;
  publicPath: string;
  bytes: number;
  integrity?: string;
}

export interface ResponsiveImageManifestEntry {
  sourcePath: string;
  variants: readonly ResponsiveImageVariant[];
}

export interface AssetManifest {
  version: 1;
  algorithm: IntegrityAlgorithm | false;
  assets: readonly AssetRecord[];
  bySource: Readonly<Record<string, string>>;
  responsiveImages?: readonly ResponsiveImageManifestEntry[];
}

export interface AssetPipelineOptions {
  root: string;
  clientDir: string;
  publicDir: string;
  publicAssetMode: 'preserve' | 'hashed' | 'both';
  integrity: IntegrityAlgorithm | false;
  optimize: boolean;
  preload: boolean;
  prefetch: boolean;
  criticalAssets: readonly string[];
  responsiveImages: readonly ResponsiveImageRequest[];
}

export interface ResourceHint {
  relation: 'modulepreload' | 'preload' | 'prefetch';
  href: string;
  as?: 'script' | 'style' | 'font' | 'image' | 'video' | 'audio' | 'worker' | 'fetch';
  type?: string;
  crossOrigin?: 'anonymous';
  integrity?: string;
}

export interface ResourceHintManifest {
  version: 1;
  entry: readonly ResourceHint[];
  deferred: readonly ResourceHint[];
}

export interface ResponsiveImageRequest {
  sourcePath: string;
  widths: readonly number[];
  formats?: readonly string[];
  quality?: number;
}

export interface ImageTransformRequest {
  source: Uint8Array;
  sourcePath: string;
  width: number;
  format: string;
  quality: number;
}

export type ImageTransformer = (request: ImageTransformRequest) => Promise<Uint8Array>;
