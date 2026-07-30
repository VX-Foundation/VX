# Public framework benchmark harness

This suite compares VX with React, Next.js, Svelte, SvelteKit, Solid, Vue, and Nuxt only through framework-native fixtures. A common JavaScript loop or synthetic fallback is explicitly forbidden.

## Reproducible workflow

1. Run `node scripts/prepare.mjs` with registry access. It resolves exact stable versions, creates package lockfiles, installs with scripts disabled, and records SHA-512 lockfile integrity.
2. Provide each fixture's `native-runner.mjs`. It must import the declared framework runtime directly and export `createNativeBenchmarkAdapter(context)`.
3. Run `node scripts/run.mjs --framework all --scenario all` from a clean Git commit and a pinned browser/container image.
4. Publish raw JSON results, source integrity, fixture lockfiles, evidence artifacts, hardware details, commit and runner version together.

Every measured iteration must retain evidence for the native runtime, scenario contract, rendered output digest and raw artifact. Missing evidence, missing exact versions, a dirty worktree, absent lockfile integrity or absent native implementation causes a hard failure.

The repository intentionally contains no fabricated comparison numbers. Framework-native fixture implementations require their real toolchains and are external execution gates when dependencies and browsers are unavailable.
