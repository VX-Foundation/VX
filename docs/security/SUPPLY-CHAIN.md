# Supply-chain policy

- The package manager version is exact and repository-owned.
- Frozen lockfiles are mandatory in CI and releases.
- Dependency install scripts are denied except for explicitly reviewed packages.
- Git, arbitrary URL, local filesystem, and unverified archive dependency specifications are rejected.
- Dependency review blocks high-severity vulnerabilities and prohibited licenses.
- Publication requires integrity manifests, provenance, API compatibility checks, and a clean source tree.
- Plugins may require detached Ed25519 signatures bound to SHA-512 source integrity.
- Release credentials are available only to the protected release environment and are never exposed to pull requests.
