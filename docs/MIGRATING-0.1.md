# Migrating to VX 0.1

VX 0.1 makes the following previously implicit requirements enforceable:

- Informative `Image` widgets require `alt`; decorative images require `decorative: true`.
- Form controls require `label`, `ariaLabel`, or `ariaLabelledBy`.
- `IFrame` requires a title.
- Positive `tabIndex` and nested interactive widgets are rejected.
- Executable and unsupported URL schemes are removed on both SSR and client updates.
- Server actions default to authenticated access and required CSRF verification.
- Action contracts cannot be replaced by a different contract under the same stable ID.
- Serialized request/action data is bounded and rejects dangerous object keys.
- Public packages must publish only `dist`, must not contain install lifecycle scripts, and must use the configured registry.

Run `vx format`, `vx inspect`, the component harness, and `pnpm verify:release-candidate` before creating a release candidate.
