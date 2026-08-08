# VX Release Process

## Distribution channels

- `canary` publishes short-lived evaluation builds using versions such as `0.2.0-canary.<revision>.<sequence>`.
- `next` publishes compatible release candidates such as `0.2.0-next.<sequence>`.
- `latest` is reserved for stable releases. VX 1.0 cannot use this tag until every criterion in `release/v1-readiness.json` passes.

## Required preparation

1. Merge through the protected `main` branch.
2. Confirm the canonical repository and npm scope ownership.
3. Configure npm trusted publishing for `.github/workflows/release.yml`.
4. Run `pnpm release:npm-preflight` from an authenticated maintainer workstation.
5. Start the GitHub `Release` workflow with `canary` or `next`.

## Automated release gates

The workflow installs from the frozen lockfile, runs the complete release-candidate gate, executes Chromium/Firefox/WebKit tests, verifies package archives, installs the package set in a clean consumer, validates generated projects, checks API compatibility, generates provenance, and publishes through npm OIDC.

Stable publication additionally verifies protected GitHub checks for Windows, Linux, macOS, Node 22/24, browsers, official applications, security, and CodeQL. It then requires external audit, native benchmark, production application, and stabilization evidence.

## Post-publish verification

After npm publication:

1. Install `@vx-foundation/create-vx` and the package set from the published dist-tag in an empty environment.
2. Create all four official templates.
3. Run doctor, check, lint, test, build, and preview smoke tests.
4. Record the version, source revision, publication time, incidents, and artifact integrity in `release/stabilization-log.json`.
5. Create the matching GitHub prerelease or release.

Never promote a dist-tag to `latest` manually to bypass the stable gate.
