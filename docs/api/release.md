# @vx/release

Public API compatibility, package policy, release channels, and provenance tooling for VX.

Current package line: `0.1.0`.

## Public entries

- `.` → `./dist/index.d.ts`
- `./compatibility` → `./dist/compatibility.d.ts`
- `./policy` → `./dist/policy.d.ts`
- `./provenance` → `./dist/provenance.d.ts`
- `./snapshot` → `./dist/snapshot.d.ts`

## Exported symbols

- `collectPublicSymbols` — function in `snapshot.ts`
- `compareApiSnapshots` — function in `compatibility.ts`
- `CompatibilityChange` — interface in `types.ts`
- `CompatibilityReport` — interface in `types.ts`
- `createProvenanceManifest` — function in `provenance.ts`
- `createReleaseChannelPlan` — function in `channels.ts`
- `CreateReleasePlanOptions` — interface in `channels.ts`
- `createWorkspaceApiSnapshot` — function in `snapshot.ts`
- `CreateWorkspaceSnapshotOptions` — interface in `snapshot.ts`
- `impactRank` — function in `semver.ts`
- `maximumImpact` — function in `semver.ts`
- `PackageCompatibilityResult` — interface in `types.ts`
- `PackagePolicyIssue` — interface in `types.ts`
- `PackagePolicyOptions` — interface in `policy.ts`
- `PackagePolicyResult` — interface in `types.ts`
- `ParsedVersion` — interface in `semver.ts`
- `parseVersion` — function in `semver.ts`
- `ProvenanceFile` — interface in `types.ts`
- `ProvenanceInputFile` — interface in `provenance.ts`
- `ProvenanceManifest` — interface in `types.ts`
- `PublicEntrypointSnapshot` — interface in `types.ts`
- `PublicPackageSnapshot` — interface in `types.ts`
- `PublicSymbolSnapshot` — interface in `types.ts`
- `ReleaseChannel` — type in `types.ts`
- `ReleaseChannelPlan` — interface in `types.ts`
- `SemverImpact` — type in `types.ts`
- `snapshotPackage` — function in `snapshot.ts`
- `validatePackagePolicy` — function in `policy.ts`
- `verifyProvenanceManifest` — function in `provenance.ts`
- `versionImpact` — function in `semver.ts`
- `WorkspaceApiSnapshot` — interface in `types.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
