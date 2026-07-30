# State and Reactivity

VX separates values by responsibility.

| Declaration | Responsibility |
|---|---|
| `prop` | typed read-only component input |
| `const` | immutable, non-reactive value |
| `state` | owned mutable reactive value |
| `derive` | pure reactive computation |
| `query` | managed external read |
| `action` | legal mutation and operation boundary |
| `effect` | synchronization with an external system |
| `store` | shared graph with explicit lifetime |

## State and actions

```vx
state count: Int = 0

action increment() {
  count++
}
```

State mutation outside an action is rejected. Props, constants, derives, query results, and store consumption surfaces remain read-only.

## Constants and derives

```vx
const pageSize: Int = 24
derive doubled: Int = count * 2
```

A constant cannot depend on reactive declarations. A derive is synchronous, reactive, and free of mutation.

## Queries

```vx
query products from productLoader {
  category: category
  page: page

  policy {
    stale: 30s
    retain: 5m
    retry: 2
    backoff: exponential
  }
}
```

Managed queries provide deterministic keys, cache sharing, deduplication, cancellation, retry, stale state, invalidation, retention, garbage collection, dehydration, and hydration primitives.

## Actions

Actions own async status, cancellation, optimistic updates, rollback, invalidation, and refresh transactions.

```vx
action save(name: String) {
  optimistic(profile, current => { ...current, name })
  await api.save(name)
  invalidate(profile)
}
```

## Effects

```vx
effect observeViewport {
  window.addEventListener("resize", updateViewport)
  return () => window.removeEventListener("resize", updateViewport)
}
```

Effects receive compiler-derived dependencies, cancellation, guarded async commits, and deterministic cleanup. Manual dependency arrays are not part of VX.
