# @vx-foundation/plugins

Versioned, capability-based plugin host and official deterministic VX plugins.

Current package line: `0.1.1`.

## Public entries

- `.` -> `./dist/index.d.ts`
- `./host` -> `./dist/host.d.ts`
- `./sandbox` -> `./dist/sandbox.d.ts`
- `./signing` -> `./dist/signing.d.ts`
- `./sitemap` -> `./dist/sitemap/index.d.ts`
- `./source-integrity` -> `./dist/source-integrity.d.ts`

## Exported symbols

- `canonicalPluginManifest` - function in `host.ts`
- `isolatedIntegrationMetadata` - function in `isolation.ts`
- `IsolatedIntegrationMetadata` - interface in `isolation.ts`
- `IsolatedPluginOptions` - interface in `sandbox.ts`
- `markIsolatedIntegration` - function in `isolation.ts`
- `PluginExecutionContext` - interface in `host.ts`
- `PluginHost` - class in `host.ts`
- `PluginHostPolicy` - interface in `host.ts`
- `PluginSourceSnapshot` - interface in `source-integrity.ts`
- `signPluginManifest` - function in `signing.ts`
- `SitemapOptions` - interface in `sitemap/index.ts`
- `snapshotPluginSource` - function in `source-integrity.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
