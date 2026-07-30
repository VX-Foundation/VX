# Server Boundaries

Server code executes with request-scoped context. Client bundles MUST NOT contain server-only modules, environment secrets, filesystem access, or Node-only APIs.

## Requests

The server platform owns request IDs, tracing, locals, sessions, middleware, rate limits, security headers, CORS, body parsing, endpoint dispatch, streaming, and deferred work.

## Authentication and authorization

Authentication establishes a principal. Authorization is evaluated on the server for each protected action, endpoint, form, and data operation. Client-side visibility is not an authorization boundary.

## Sessions

Session identifiers are opaque and signed. Secure production cookies use `HttpOnly`, `Secure`, an appropriate `SameSite` policy, and a restricted path. Session regeneration is required after privilege changes.

## Forms and uploads

Form input is bounded, decoded, validated, authorized, and protected against CSRF. Upload metadata and content are untrusted. File type, size, storage key, and processing policy are server-owned.

## Errors

Operational details and secrets MUST NOT be exposed to clients. Safe error codes may be public; internal causes belong to structured logs and traces.
