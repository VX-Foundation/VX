# Initial npm bootstrap

Trusted publishing is the permanent release path for VX. A new npm package must exist before its package settings can be linked to a trusted publisher, so the first publication is a controlled bootstrap rather than the normal release workflow.

## Preconditions

1. Confirm that the `@vx` npm scope and the unscoped `create-vx` name are controlled by the VX maintainers. Package-name availability is not assumed by this repository.
2. Enable two-factor authentication on every maintainer account.
3. Run the repository, package, clean-room, security, and `next` readiness gates from a clean commit.
4. Inspect every generated tarball and confirm its repository, license, README, exports, integrity, and version.

## One-time publication

Use one of these reviewed bootstrap methods:

- publish interactively with two-factor authentication; or
- use a short-lived granular npm token restricted to the required packages, protected by a GitHub environment, and revoke it immediately after the bootstrap.

Do not store a permanent automation token in the repository or organization.

The initial public line is `0.1.0` and must use the `next` distribution tag. `latest` remains reserved for the approved VX 1.0 release.

## Enable trusted publishing

After every package exists on npm:

1. Configure its trusted publisher for `VX-Foundation/vx` and `.github/workflows/release.yml`.
2. Allow `npm publish` only from the protected `npm` GitHub environment.
3. Remove and revoke the bootstrap credential.
4. Run `pnpm release:npm-preflight` with npm 11.5.1 or newer.
5. Publish future canary and next releases exclusively through the Release workflow.
6. Verify registry signatures and provenance after publishing.

The repository workflow requests `id-token: write`; npm exchanges the GitHub OIDC identity for short-lived publishing authorization and produces registry provenance.
