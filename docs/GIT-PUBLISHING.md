# Git and GitHub bootstrap

The source archive intentionally contains no `.git` directory. Repository history, signatures, protected branches, and release evidence must be created in the canonical Git host rather than fabricated inside a distribution archive.

## Initialize after extraction

```bash
node scripts/release/initialize-git.mjs
```

The command:

- initializes branch `main` only when Git is not already initialized;
- configures the canonical `origin` from `package.json`;
- refuses to overwrite an origin pointing somewhere else;
- never stages, commits, signs, or pushes automatically.

Use `--remote <url>` only when the canonical repository identity has been deliberately changed across all release manifests and freeze policies. Use `--no-remote` for a local mirror.

## First push

Before the initial commit:

1. run `pnpm install --frozen-lockfile` in a supported Node environment;
2. run `pnpm verify:release-candidate`;
3. review generated provenance and repository metadata;
4. create a signed commit and signed tag according to the maintainer policy;
5. push to GitHub and enable branch protection, required checks, secret scanning, Dependabot, CodeQL, and environment approvals;
6. never push npm credentials or external-audit evidence containing secrets.

The `main` branch is the release source. Canary, next, and stable tags must point to commits whose protected checks passed.
