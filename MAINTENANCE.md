# Maintenance Policy

## Supported environments

VX 0.1 targets maintained Node.js 22 and 24 LTS lines, modern evergreen browsers, and the deployment adapters documented in `docs/guides/deployment.md`.

## Release cadence

- Canary releases may be created from reviewed commits for early validation.
- Next releases collect compatible changes and migration notes during stabilization.
- Stable releases use Semantic Versioning and require all VX 1.0 readiness evidence.

## Security and fixes

Critical security fixes take priority over feature work. The latest stable minor and current `next` line receive fixes according to `SECURITY.md`. Canary builds are not supported.

## Deprecation

Public APIs are deprecated before removal whenever technically possible. Deprecations require a diagnostic, replacement guidance, migration metadata, and a SemVer-compatible release path.

## End of life

Support windows and end-of-life dates are announced in release notes and `docs/SUPPORT-POLICY.md`. A release line is not silently abandoned.
