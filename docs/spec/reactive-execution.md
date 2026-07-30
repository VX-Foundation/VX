# Reactive Execution

## Declarations

`state`, `derive`, `query`, `action`, `effect`, and `store` form the reactive program.

Dependencies are inferred from syntax trees. Strings, property names, and shadowed local variables are not dependencies.

## State

State mutation MUST occur inside an action or another compiler-authorized mutation boundary. Mutations are batched by default for a synchronous action turn.

## Derived state

A derive MUST be synchronous and free of externally visible side effects. Cycles are diagnosed. A derive invalidates only consumers that depend on it.

## Queries

Queries represent managed reads. Their keys MUST be deterministic and serializable. Runtime policies define stale time, retention, retry, backoff, execution side, and network behavior.

## Actions

Actions are operation boundaries. They own cancellation, concurrency, retries, progress, optimistic changes, rollback, invalidation, and refresh transactions.

## Effects

Effects synchronize with external systems. They receive deterministic cleanup and cancellation. A stale asynchronous effect execution MUST NOT commit after a newer execution owns the effect.

## Scheduling

The runtime supports immediate, user-blocking, normal, transition, and idle priorities. Cancellation and cooperative yielding are observable only through timing, never through inconsistent state.
