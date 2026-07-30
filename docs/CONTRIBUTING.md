# Contributing to VX

VX is in the 0.1 stabilization line. Contributions must preserve the frozen specification, public API baseline, security boundaries, and release evidence model.

## Required reading

- `docs/framework/README.md`
- `docs/spec/README.md`
- `docs/framework/architecture.md`
- `docs/ENGINEERING-STANDARDS.md`
- `docs/COMPATIBILITY.md`
- `docs/RFC-PROCESS.md`
- `SECURITY.md`

## Development setup

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:release-candidate
```

Node.js 22 and 24 are supported. Do not introduce a second package manager or duplicate the pnpm version in workflows.

## Change requirements

- Bug fixes require a regression test that fails before the fix.
- Language, public API, package format, compiler/runtime ownership, compatibility, or security-boundary changes require an accepted RFC.
- Public package changes require a Changeset after the 0.1.0 baseline.
- Package changes require tarball inspection and external clean-room installation.
- Security changes require threat-model coverage.
- Generated output, dependency directories, secrets, and temporary files are never committed.
- Source, diagnostics, examples, tests, and documentation are written in English.
- Authored files stay below 1,000 lines and should be split before 700 lines when responsibilities diverge.

## Pull requests

Explain the problem, design, validation, compatibility impact, migration needs, and security/accessibility implications. A passing structural checker cannot replace executable coverage.
