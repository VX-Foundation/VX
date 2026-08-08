# @vx-foundation/data

VX query persistence, offline mutations, infinite data, realtime subscriptions, and cross-context synchronization.

Current package line: `0.2.0`.

## Public entries

- `.` -> `./dist/index.d.ts`
- `./broadcast` -> `./dist/broadcast.d.ts`
- `./hub` -> `./dist/hub.d.ts`
- `./infinite` -> `./dist/infinite.d.ts`
- `./offline` -> `./dist/offline.d.ts`
- `./persistence` -> `./dist/persistence.d.ts`
- `./realtime` -> `./dist/realtime.d.ts`

## Exported symbols

- `createInfiniteQuery` - function in `infinite.ts`
- `createMemoryPersistenceAdapter` - function in `persistence.ts`
- `createWebStoragePersistenceAdapter` - function in `persistence.ts`
- `DataBroadcastChannel` - interface in `broadcast.ts`
- `DataPersistenceAdapter` - interface in `persistence.ts`
- `EventSourceTransport` - class in `realtime.ts`
- `InfiniteQuery` - interface in `infinite.ts`
- `InfiniteQueryOptions` - interface in `infinite.ts`
- `InfiniteQuerySnapshot` - interface in `infinite.ts`
- `MutationQueueSnapshot` - interface in `offline.ts`
- `MutationQueueStatus` - type in `offline.ts`
- `OfflineMutation` - interface in `offline.ts`
- `OfflineMutationQueue` - class in `offline.ts`
- `OfflineMutationQueueOptions` - interface in `offline.ts`
- `persistQueryClient` - function in `persistence.ts`
- `QueryBroadcastOptions` - interface in `broadcast.ts`
- `QueryPersistenceController` - interface in `persistence.ts`
- `QueryPersistenceOptions` - interface in `persistence.ts`
- `RealtimeBackplane` - interface in `hub.ts`
- `RealtimeClient` - class in `realtime.ts`
- `RealtimeClientOptions` - interface in `realtime.ts`
- `RealtimeConnection` - interface in `realtime.ts`
- `RealtimeHub` - class in `hub.ts`
- `RealtimeMessage` - interface in `realtime.ts`
- `RealtimePeer` - interface in `hub.ts`
- `RealtimeStatus` - type in `realtime.ts`
- `RealtimeTransport` - interface in `realtime.ts`
- `synchronizeQueryClient` - function in `broadcast.ts`
- `WebSocketTransport` - class in `realtime.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
