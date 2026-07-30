# Official VX testing

## Layers

1. Unit tests execute isolated pure contracts.
2. Component tests mount compiled components and guarantee deterministic disposal.
3. DOM tests query by semantic role and accessible name instead of implementation selectors.
4. SSR tests assert byte-for-byte deterministic markup.
5. Hydration tests compare server and client token streams and report recovery suggestions.
6. Route, action, and endpoint tests invoke production contracts with real `Request` and `Response` objects.
7. Browser tests run Chromium, Firefox, and WebKit.
8. Visual regression tests use fixed viewports, fonts, locale, time zone, color scheme, reduced-motion setting, and screenshot thresholds.
9. Accessibility tests combine compiler diagnostics, runtime audits, keyboard tests, and browser accessibility scans.
10. Performance tests store raw samples and enforce versioned budgets.

Tests must not depend on execution order, network access, wall-clock time, random global state, or shared mutable fixtures. Randomized tests must record their seed.
