# Package manager policy

VX development uses pnpm 11 and keeps one exact toolchain version in the root manifest:

```json
{
  "packageManager": "pnpm@11.17.0",
  "engines": {
    "pnpm": ">=11.17.0 <12"
  }
}
```

`packageManager` is the reproducible toolchain pin used by Corepack and CI. `engines.pnpm` declares the supported pnpm major for environments that manage the executable separately.

## Setup

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm --version
```

The expected version for release work is `11.17.0`. pnpm 11 requires Node.js 22 or newer.

## pnpm 11 configuration

Project settings live in `pnpm-workspace.yaml`:

```yaml
pmOnFail: download
engineStrict: true
strictDepBuilds: true
minimumReleaseAge: 1440

allowBuilds:
  esbuild: true
```

`pmOnFail: download` replaces the removed `packageManagerStrictVersion` setting. When another pnpm version starts in the repository, pnpm downloads and runs the pinned version instead of leaving the workspace in an unsupported state.

pnpm 11 reads only registry and authentication settings from `.npmrc`; pnpm-specific project settings must remain in `pnpm-workspace.yaml`.

## Verification

```bash
pnpm verify:package-manager
```

The verifier checks:

- an exact `packageManager` pin;
- a matching supported-major range in `engines.pnpm`;
- pnpm 11 or newer;
- `pmOnFail`, `engineStrict`, `strictDepBuilds`, and `minimumReleaseAge`;
- the explicit `allowBuilds.esbuild` approval;
- absence of removed pnpm 10 build and strictness settings;
- absence of duplicated pnpm versions in GitHub Actions.
