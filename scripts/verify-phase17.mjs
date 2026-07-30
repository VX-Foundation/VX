import { readFile } from 'node:fs/promises';

const files = {
  types: await readFile(new URL('../packages/types/src/config.ts', import.meta.url), 'utf8'),
  assets: await readFile(new URL('../packages/bundler/src/assets/pipeline.ts', import.meta.url), 'utf8'),
  responsive: await readFile(new URL('../packages/bundler/src/assets/responsive.ts', import.meta.url), 'utf8'),
  build: await readFile(new URL('../packages/bundler/src/build.ts', import.meta.url), 'utf8'),
  browserManifest: await readFile(new URL('../packages/bundler/src/build/browser-manifest.ts', import.meta.url), 'utf8'),
  hints: await readFile(new URL('../packages/bundler/src/assets/hints.ts', import.meta.url), 'utf8'),
  options: await readFile(new URL('../packages/bundler/src/build/options.ts', import.meta.url), 'utf8'),
  adapters: await readFile(new URL('../packages/bundler/src/adapters/registry.ts', import.meta.url), 'utf8'),
  render: await readFile(new URL('../packages/runtime/src/server-platform/render.ts', import.meta.url), 'utf8'),
  cli: await readFile(new URL('../packages/cli/src/cli.ts', import.meta.url), 'utf8')
};

const required = [
  ['asset kinds', files.types, 'ResponsiveImageBuildConfig'],
  ['public assets', files.assets, 'copyPublicAssets'],
  ['content hashing', files.assets, 'contentHash'],
  ['subresource integrity', files.assets, 'integrityHash'],
  ['responsive images', files.responsive, 'generateResponsiveImageVariants'],
  ['browser build', files.build, 'browserConfig'],
  ['entry graph', files.browserManifest, 'consumeBrowserAssetGraph'],
  ['critical asset hints', files.hints, 'criticalAssets'],
  ['server build', files.build, 'serverConfig'],
  ['edge build', files.build, 'edgeConfig'],
  ['static build', files.options, "targets.includes('static')"],
  ['library build', files.build, 'buildLibrary'],
  ['incremental build', files.build, 'reuseCachedBuild'],
  ['deterministic build', files.build, 'SOURCE_DATE_EPOCH'],
  ['reproducible build', files.build, 'Reproducible build violation'],
  ['source maps', files.build, 'viteSourceMap'],
  ['bundle analysis', files.build, 'analyzeBuild'],
  ['chunk policy', files.options, 'maxInitialBytes'],
  ['dependency optimization', files.build, 'dependencyOptimization'],
  ['SSR integrity', files.render, 'clientEntryIntegrity'],
  ['resource hints', files.render, 'resourceHints'],
  ['CLI build targets', files.cli, '--target <targets>']
];
for (const [name, source, marker] of required) if (!source.includes(marker)) throw new Error(`Phase 17 missing ${name}.`);

for (const adapter of ['nodeAdapter', 'dockerAdapter', 'staticDeploymentAdapter', 'cloudflareWorkersAdapter', 'cloudflarePagesAdapter', 'vercelAdapter', 'netlifyAdapter', 'awsLambdaAdapter', 'genericServerlessAdapter', 'bunAdapter', 'denoAdapter', 'edgeRuntimeAdapter']) {
  if (!files.adapters.includes(adapter)) throw new Error(`Phase 17 missing adapter ${adapter}.`);
}
console.log(`Phase 17 structural verification passed (${required.length} build contracts, 12 official adapters).`);
