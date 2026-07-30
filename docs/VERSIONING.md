# Versioning and Distribution Tags

VX follows Semantic Versioning for every public package.

## Initial unstable line

All public packages start at `0.1.0`. During stabilization, prerelease builds use synchronized versions:

- `0.1.0-canary.<revision>.<sequence>` published under `canary`;
- `0.1.0-next.<sequence>` published under `next`;
- `1.0.0` published under `latest` only after the stable gate passes.

## Compatibility

The public API baseline records exported entrypoints and declarations. A release is rejected when its version change is smaller than the detected compatibility impact. Internal source paths are never public contracts.

## Changesets

Every user-visible package change after the 0.1.0 baseline requires a Changeset. Historical phase Changesets were archived before the initial release so they cannot accidentally bump the first public version.
