# Changelog

All notable VX changes are documented here. The project follows Semantic Versioning and uses Changesets for package-level release notes.

## 0.1.1 - Unreleased

- Migrated every public npm package from the legacy `@vx/*` namespace to the VX Foundation-owned `@vx-foundation/*` namespace.
- Added the public `@vx-foundation/vx` facade and moved the project generator to `@vx-foundation/create-vx`.
- Fixed clean CI builds by removing generated TypeScript build information from version control and enforcing the rule in repository policy checks.
- Fixed static server loading so compiled server entries can resolve their relative chunks.
- Updated npm bootstrap, package verification, API documentation, and release automation for the 25 synchronized public packages.

This version is intended for the `next` distribution tag. It is not VX 1.0 and does not carry stable compatibility guarantees.

## 0.1.0 - Internal baseline

- Migrated the development toolchain to pnpm 11.17.0, replaced the removed `packageManagerStrictVersion` setting with `pmOnFail`, moved pnpm project settings to `pnpm-workspace.yaml`, and aligned generated templates and release gates with pnpm 11.
- Completed the internal language, compiler, runtime, router, server, data, forms, tooling, package, testing, documentation, and conformance baseline delivered through Phases 1-22.

This version was not published as the VX Foundation npm package line.
