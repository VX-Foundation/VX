# @vx-foundation/security-testing

Deterministic fuzzing, secret scanning, and supply-chain policy primitives for VX.

Current package line: `0.1.1`.

## Public entries

- `.` -> `./dist/index.d.ts`
- `./fuzz` -> `./dist/fuzz.d.ts`
- `./mutators` -> `./dist/mutators.d.ts`
- `./random` -> `./dist/random.d.ts`
- `./secrets` -> `./dist/secrets.d.ts`
- `./supply-chain` -> `./dist/supply-chain.d.ts`

## Exported symbols

- `ByteMutator` - type in `mutators.ts`
- `createDeterministicRandom` - function in `random.ts`
- `defaultByteMutators` - const in `mutators.ts`
- `DeterministicRandom` - interface in `random.ts`
- `FuzzCampaignOptions` - interface in `fuzz.ts`
- `FuzzCrash` - interface in `fuzz.ts`
- `FuzzReport` - interface in `fuzz.ts`
- `reviewLockfileText` - function in `supply-chain.ts`
- `reviewPackageManifest` - function in `supply-chain.ts`
- `scanSecrets` - function in `secrets.ts`
- `SecretFinding` - interface in `secrets.ts`
- `SecretScanOptions` - interface in `secrets.ts`
- `SupplyChainIssue` - interface in `supply-chain.ts`
- `SupplyChainPolicy` - interface in `supply-chain.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
