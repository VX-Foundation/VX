# Versioning and Distribution Tags

VX follows Semantic Versioning for every public package. The canonical release metadata lives in `release/version.json`; package manifests and generated release documents are derived from it.

## Historical baseline

The unpublished internal baseline was `0.1.0`, and the first VX Foundation public line began at `0.1.1`. Historical versions remain in changelogs and migration documents and are not synchronization targets.

## Current unstable line

The current synchronized framework version is `0.2.0` on the `next` release channel. All public `@vx-foundation/*` packages use the same version:

- `0.2.0-canary.<revision>.<sequence>` under `canary`;
- `0.2.0-next.<sequence>` under `next`;
- `1.0.0` under `latest` only after the stable gate passes.

The active compatibility line is VX 0.2. Private repository applications follow the same framework version so integration drift is detected before publication. Template projects keep their own initial project version, while their VX dependencies are replaced with `^0.2.0` when generated.

## Compatibility

The public API baseline records exported entrypoints and declarations. A release is rejected when its version change is smaller than the detected compatibility impact. Internal source paths are never public contracts.

## Changesets

Every user-visible public package change requires a Changeset. The public package set is configured as one fixed Changesets group, and `pnpm version-packages` adopts the resulting root version into `release/version.json` before regenerating every derived version surface.
