# @vx-foundation/package-system

Deterministic package metadata, lockfiles, workspaces, integrity, signatures, and dependency mutation for VX.

Current package line: `0.2.0`.

## Public entries

- `.` -> `./dist/index.d.ts`
- `./contracts` -> `./dist/contracts.d.ts`
- `./exports` -> `./dist/exports.d.ts`
- `./integrity` -> `./dist/integrity.d.ts`
- `./lockfile` -> `./dist/lockfile.d.ts`
- `./metadata` -> `./dist/metadata.d.ts`
- `./publication` -> `./dist/publication.d.ts`
- `./semver` -> `./dist/semver.d.ts`
- `./signatures` -> `./dist/signatures.d.ts`
- `./workspace` -> `./dist/workspace.d.ts`

## Exported symbols

- `addPackage` - function in `mutations.ts`
- `canonicalJson` - function in `canonical.ts`
- `comparePublicContracts` - function in `contracts.ts`
- `compareSemver` - function in `semver.ts`
- `createFileIntegrity` - function in `integrity.ts`
- `createIntegrity` - function in `integrity.ts`
- `createPublicationManifest` - function in `publication.ts`
- `CreatePublicationManifestOptions` - interface in `publication.ts`
- `createPublicContractSnapshot` - function in `contracts.ts`
- `createWorkspaceGraph` - function in `workspace.ts`
- `createWorkspaceLockfile` - function in `lockfile.ts`
- `DependencyKind` - type in `types.ts`
- `discoverWorkspacePackages` - function in `workspace.ts`
- `emptyLockfile` - function in `lockfile.ts`
- `ExportIssue` - interface in `exports.ts`
- `flattenPackageExportTargets` - function in `exports.ts`
- `IntegrityAlgorithm` - type in `integrity.ts`
- `MetadataIssue` - interface in `metadata.ts`
- `MutatePackageOptions` - interface in `mutations.ts`
- `PackageMutation` - interface in `types.ts`
- `PackageMutationResult` - interface in `types.ts`
- `PackageSignature` - interface in `signatures.ts`
- `parseIntegrity` - function in `integrity.ts`
- `parseSemver` - function in `semver.ts`
- `parseSpecification` - function in `mutations.ts`
- `PublicationFile` - interface in `types.ts`
- `PublicationManifest` - interface in `types.ts`
- `PublicContractChange` - interface in `types.ts`
- `PublicContractComparison` - interface in `types.ts`
- `PublicContractSnapshot` - interface in `types.ts`
- `readLockfile` - function in `lockfile.ts`
- `readPackageMetadata` - function in `metadata.ts`
- `removePackage` - function in `mutations.ts`
- `resolvePackageExport` - function in `exports.ts`
- `satisfiesSemver` - function in `semver.ts`
- `SemVer` - interface in `semver.ts`
- `SemVerIdentifier` - interface in `semver.ts`
- `signPackagePayload` - function in `signatures.ts`
- `topologicalWorkspaceOrder` - function in `workspace.ts`
- `updateLockedPackage` - function in `lockfile.ts`
- `updatePackage` - function in `mutations.ts`
- `validateLockfile` - function in `lockfile.ts`
- `validatePackageExports` - function in `exports.ts`
- `validatePackageMetadata` - function in `metadata.ts`
- `validPackageName` - function in `metadata.ts`
- `validRegistrySelector` - function in `semver.ts`
- `validSemver` - function in `semver.ts`
- `validSemverRange` - function in `semver.ts`
- `verifyIntegrity` - function in `integrity.ts`
- `verifyLockfileGraph` - function in `lockfile.ts`
- `verifyPackageSignature` - function in `signatures.ts`
- `verifyPublicationManifest` - function in `publication.ts`
- `VX_LOCKFILE` - const in `lockfile.ts`
- `VXLockedWorkspacePackage` - interface in `types.ts`
- `VXLockfile` - interface in `types.ts`
- `VXLockImporter` - interface in `types.ts`
- `VXLockPackage` - interface in `types.ts`
- `VXPackageDeprecation` - interface in `types.ts`
- `VXPackageExportConditions` - interface in `types.ts`
- `VXPackageExportTarget` - type in `types.ts`
- `VXPackageMetadata` - interface in `types.ts`
- `VXPackageMigration` - interface in `types.ts`
- `VXPackageProvenanceReference` - interface in `types.ts`
- `VXPublicContract` - interface in `types.ts`
- `WorkspaceGraph` - interface in `types.ts`
- `WorkspacePackage` - interface in `types.ts`
- `writeLockfile` - function in `lockfile.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
