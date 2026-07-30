# Types and Values

VX is statically typed. Every declaration has an inferred or explicit type, and public contracts SHOULD use explicit types.

## Core types

The core type vocabulary includes `Bool`, `Int`, `Float`, `String`, `Void`, `Any`, `Optional<T>`, `List<T>`, maps, records, functions, events, promises, streams, and component contract types.

## Mutability

- `const` is immutable and non-reactive.
- `prop` is read-only from the receiving component.
- `state` is mutable only from legal action boundaries.
- `derive` is read-only and computed.
- query results and store leases are read-only through their declared consumer surface.

Mutation of a read-only value is a compile-time error.

## Optional values

Optionality is explicit. A value of `Optional<T>` MUST be narrowed before use where `T` is required. Default values do not erase public optionality unless the contract declares a required normalized result.

## Serialization

Values crossing server, worker, persistence, devtools, or resumable boundaries MUST be serializable according to the boundary contract. Functions, DOM nodes, process handles, arbitrary class instances, secrets, and cyclic object graphs MUST NOT cross a JSON-compatible boundary unless an FFI serializer explicitly defines the representation.

## Ownership

Runtime resources have explicit owners. Effects, subscriptions, queries, stores, event listeners, focus traps, and transitions MUST register cleanup with their owner. Disposal is deterministic and idempotent.
