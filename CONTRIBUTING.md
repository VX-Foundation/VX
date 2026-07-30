# Contributing to VX

The complete contribution guide is maintained in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

Before opening a pull request, run:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:release-candidate
```

Language, public API, compatibility, security-boundary, and package-format changes require an RFC. Bug fixes require a failing regression test. All repository content must be written in English and authored source files must remain below 1,000 lines.
