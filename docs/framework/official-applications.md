# Official Applications

VX maintains three first-party applications as public-API conformance projects:

- `@vx/official-dashboard`;
- `@vx/official-commerce`;
- `@vx/official-collaboration`.

## Purpose

The applications validate the framework as a complete platform rather than as isolated packages.

The dashboard covers authentication, permissions, layouts, tables, charts, forms, SSR, queries, mutations, and typed endpoints.

The commerce application covers catalog browsing, filtering, cart state, checkout, uploads, SEO, static generation, and incremental rendering.

The collaboration application covers realtime transport, messages, presence, optimistic updates, offline queues, conflict handling, streaming, islands, and large collections.

## Public API rule

Official applications may import only entries declared in package `exports` and listed in their own manifests. Imports containing `/src`, `/dist`, `/internal`, or `/private` are rejected by repository verification.

## Release requirement

The documentation application and all official applications must typecheck, compile their `.vx` components, build valid route graphs, pass their domain tests, and produce deployable builds before a release candidate can be published.
