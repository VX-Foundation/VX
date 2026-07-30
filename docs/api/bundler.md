# @vx/bundler

VX deterministic asset pipeline, multi-target build system, and official deployment adapters

Current package line: `0.1.0`.

## Public entries

- `.` → `./dist/index.d.ts`
- `./adapters` → `./dist/adapters/index.d.ts`
- `./assets` → `./dist/assets/index.d.ts`
- `./build` → `./dist/build/index.d.ts`

## Exported symbols

- `adapterCapabilities` — function in `adapters/registry.ts`
- `AdapterCapabilities` — interface in `adapters/types.ts`
- `analyzeBuild` — function in `build/analysis.ts`
- `artifactFingerprint` — function in `build/fingerprint.ts`
- `AssetKind` — type in `assets/types.ts`
- `AssetManifest` — interface in `assets/types.ts`
- `AssetMetadata` — interface in `assets/types.ts`
- `AssetPipelineOptions` — interface in `assets/types.ts`
- `AssetPipelineResult` — interface in `assets/pipeline.ts`
- `AssetRecord` — interface in `assets/types.ts`
- `awsLambdaAdapter` — const in `adapters/aws-lambda.ts`
- `BrowserAssetGraph` — interface in `build/browser-manifest.ts`
- `BuildArtifact` — interface in `build/types.ts`
- `BuildCacheRecord` — interface in `build/cache.ts`
- `BuildMetadata` — interface in `build/types.ts`
- `BuildOptions` — interface in `build/types.ts`
- `BuildResult` — interface in `build/types.ts`
- `bunAdapter` — const in `adapters/bun.ts`
- `BundleAnalysis` — interface in `build/types.ts`
- `classifyAsset` — function in `assets/classify.ts`
- `cloudflarePagesAdapter` — const in `adapters/cloudflare.ts`
- `cloudflareWorkersAdapter` — const in `adapters/cloudflare.ts`
- `consumeBrowserAssetGraph` — function in `build/browser-manifest.ts`
- `contentHash` — function in `assets/hash.ts`
- `copyDirectory` — function in `adapters/files.ts`
- `createResourceHints` — function in `assets/hints.ts`
- `denoAdapter` — const in `adapters/deno.ts`
- `DeploymentAdapter` — interface in `adapters/types.ts`
- `DeploymentBootstrap` — interface in `adapters/bootstrap.ts`
- `DeploymentContext` — interface in `adapters/types.ts`
- `deploymentDirectory` — function in `adapters/files.ts`
- `DeploymentResult` — interface in `adapters/types.ts`
- `dockerAdapter` — const in `adapters/docker.ts`
- `edgeRuntimeAdapter` — const in `adapters/edge.ts`
- `fetchAdapterEntry` — function in `adapters/fetch-entry.ts`
- `fileHash` — function in `build/fingerprint.ts`
- `genericServerlessAdapter` — const in `adapters/serverless.ts`
- `ImageTransformer` — type in `assets/types.ts`
- `ImageTransformRequest` — interface in `assets/types.ts`
- `inspectAssetMetadata` — function in `assets/metadata.ts`
- `IntegrityAlgorithm` — type in `assets/types.ts`
- `integrityHash` — function in `assets/hash.ts`
- `LibraryBuildOptions` — type in `build/types.ts`
- `mediaTypeFor` — function in `assets/classify.ts`
- `netlifyAdapter` — const in `adapters/serverless.ts`
- `nodeAdapter` — const in `adapters/node-deployment.ts`
- `NodeAdapterOptions` — interface in `adapters/node.ts`
- `normalizeAdapterName` — function in `adapters/registry.ts`
- `normalizeBuildOptions` — function in `build/options.ts`
- `NormalizedBuildOptions` — interface in `build/types.ts`
- `normalizeLibraryEntries` — function in `build/library.ts`
- `normalizeLibraryFileName` — function in `build/library.ts`
- `officialAdapters` — function in `adapters/registry.ts`
- `optimizeAsset` — function in `assets/optimize.ts`
- `readBuildCache` — function in `build/cache.ts`
- `readDeploymentBootstrap` — function in `adapters/bootstrap.ts`
- `relativeImport` — function in `adapters/files.ts`
- `renderResourceHints` — function in `assets/hints.ts`
- `requireEntry` — function in `adapters/files.ts`
- `ResourceHint` — interface in `assets/types.ts`
- `ResourceHintManifest` — interface in `assets/types.ts`
- `ResponsiveImageManifestEntry` — interface in `assets/types.ts`
- `ResponsiveImageRequest` — interface in `assets/types.ts`
- `ResponsiveImageVariant` — interface in `assets/types.ts`
- `responsiveSrcSet` — function in `assets/responsive.ts`
- `runNodeAdapter` — function in `adapters/node.ts`
- `sourceFingerprint` — function in `build/fingerprint.ts`
- `stableId` — function in `assets/hash.ts`
- `StaticAdapterOptions` — interface in `adapters/static.ts`
- `staticDeploymentAdapter` — const in `adapters/static-deployment.ts`
- `validateBuildOptionsInput` — function in `build/validation.ts`
- `vercelAdapter` — const in `adapters/serverless.ts`
- `ViteLibraryEntry` — type in `build/library.ts`
- `ViteLibraryFileName` — type in `build/library.ts`
- `vitePluginVX` — function in `plugin.ts`
- `VXPluginOptions` — interface in `plugin.ts`
- `writeBuildCache` — function in `build/cache.ts`
- `writeBuildMetadata` — function in `build/cache.ts`
- `writeBundleAnalysis` — function in `build/analysis.ts`
- `writeDeploymentFile` — function in `adapters/files.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
