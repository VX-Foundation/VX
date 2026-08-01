# Modules and Packages

## Modules

A visual module contains `#view`. A headless module omits it. Visual components use default imports; headless declarations use named imports.

Imports MUST be static when they participate in the compiler-owned application graph. Cycles are rejected before lowering.

## Package boundaries

A package exposes only entries declared by its generated or authored public contract. `src`, `dist`, private modules, and undeclared subpaths are not public API.

Consumers MUST import a public package entry, for example:

```ts
import { QueryClient } from '@vx-foundation/runtime';
import { OfflineMutationQueue } from '@vx-foundation/data/offline';
```

They MUST NOT import implementation files.

## Public contracts

A public contract records exports, declarations, component props, outputs, content regions, visual parts, runtime conditions, deprecations, migrations, integrity, and framework compatibility.

Removing or changing the type of a public contract is a breaking change.

## Locking and integrity

Resolved package identities, versions, sources, integrity, and dependency edges are recorded in `vx.lock`. Lockfiles MUST be deterministic and MUST NOT contain machine-specific absolute paths.

Published artifacts MAY carry provenance and Ed25519 signatures. A failed integrity or signature check is fatal.
