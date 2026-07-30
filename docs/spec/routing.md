# Routing and Application Graph

Routes are discovered from `src/pages`. Static segments, parameters, optional parameters, and catch-all parameters form a deterministic matcher.

## Route modules

A route may provide:

- `page.vx`
- `layout.vx`
- `loading.vx`
- `error.vx`
- `not-found.vx`
- `endpoint.ts`
- `route.json`

## Rendering policy

`render` is `client`, `server`, or `static`. Generation is `dynamic`, `static`, or `incremental`. Incremental generation requires a revalidation interval.

Forms and request-specific sessions require dynamic generation. Streamed responses require dynamic generation.

## Navigation

Navigation is cancellable and preserves route boundaries, focus, scroll, transition ownership, and data invalidation. Route-specific code splitting MUST NOT preload unrelated lazy chunks.

## Endpoints and actions

Endpoint methods and server actions are trust boundaries. Inputs are parsed and validated before business logic. Authorization, origin, CSRF, body limits, timeout, rate limits, and safe errors belong to the server.
