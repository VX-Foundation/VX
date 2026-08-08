# PROGRESS

This guide groups 8 canonical widgets used for feedback scenarios.

## Widgets

- [ErrorSummary](./components/ErrorSummary.md) — `<div>`, 3 properties, 0 events.
- [FieldError](./components/FieldError.md) — `<span>`, 2 properties, 0 events.
- [FormError](./components/FormError.md) — `<div>`, 2 properties, 0 events.
- [ProgressBar](./components/ProgressBar.md) — `<progress>`, 6 properties, 0 events.
- [Skeleton](./components/Skeleton.md) — `<div>`, 3 properties, 0 events.
- [Spinner](./components/Spinner.md) — `<span>`, 2 properties, 0 events.
- [Toast](./components/Toast.md) — `<div>`, 6 properties, 1 events.
- [Tooltip](./components/Tooltip.md) — `<span>`, 3 properties, 0 events.

## Guidance

- Start from the native widget contract and compose behavior through typed state, actions, content regions, and Visual roles.
- Preserve accessible names, keyboard behavior, focus visibility, deterministic SSR output, and stable collection identity.
- Do not maintain independent property or native-element maps in application code.
