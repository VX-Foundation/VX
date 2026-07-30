# VX Official Collaboration

The collaboration application validates the VX realtime and offline data model with messages, presence, optimistic editing, conflict handling, and large cursor-backed collections. It uses only public VX APIs.

## Workloads validated

- resumable realtime transport contracts;
- message composition and optimistic delivery state;
- presence merging with monotonic timestamps;
- offline-first mutation queues and persistent adapters;
- optimistic document edits with rollback and invalidation;
- explicit version conflicts and deterministic resolution strategies;
- 10,000-item logical activity collections through bounded infinite-query windows;
- server-rendered routes, streaming boundaries, hydration islands, and endpoint events.

## Commands

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm preview
```

The in-memory transport is intentionally replaceable. Production backplanes remain adapter-owned and must preserve the public `RealtimeClient` and queue contracts.
