# Publishing VX

## Repository identity

The canonical source repository is `https://github.com/VX-Foundation/vx`. Release tags use `vx-v<version>` and must point to a reviewed commit on the protected `main` branch.

## npm organization

All public framework packages, including the `@vx-foundation/vx` facade and `@vx-foundation/create-vx` project initializer, use the `@vx-foundation` npm scope. Before the first publish, an npm administrator must confirm ownership of the organization scope, require two-factor authentication, and follow the controlled bootstrap in [`NPM-BOOTSTRAP.md`](NPM-BOOTSTRAP.md). Trusted publishers are configured after the package records exist.

## Trusted publishing

After the one-time bootstrap, the release workflow uses GitHub Actions OIDC with `id-token: write`. It does not require a long-lived npm token. Package archives are built, inspected, installed in a clean consumer, checked against the API baseline, and published only after channel policy succeeds.

## Commands

```bash
pnpm release:repository-check
pnpm release:npm-preflight
pnpm verify:release-candidate
```

Publishing is normally started from the GitHub `Release` workflow. Do not publish a workspace package manually from a developer machine.
