# VX Official Commerce

The commerce application is a first-party conformance workload for catalog browsing, shopping state, secure checkout, uploads, SEO, static generation, and incremental rendering. It imports only declared public VX package entries.

## Workloads validated

- searchable and category-filtered catalog pages;
- responsive product media and product detail routes;
- offline-first cart mutations with deterministic idempotency keys;
- checkout forms and bounded typed endpoints;
- authenticated multipart listing uploads with schema validation;
- CSRF verification bound to the authenticated user;
- route metadata, canonical URLs, and SEO output;
- static product generation and incremental catalog regeneration;
- browser/server/static build targets with SRI and optimized assets.

## Environment

Set `COMMERCE_CSRF_SECRET` to at least 32 random bytes. The demo user header is only a replaceable authentication boundary for this conformance application; production deployments must connect it to a real identity provider or server session.

## Commands

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm preview
```
