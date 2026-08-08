# NAVIGATION

This guide groups 4 canonical widgets used for navigation, composite scenarios.

## Widgets

- [Accordion](./components/Accordion.md) — `<details>`, 4 properties, 1 events.
- [Breadcrumb](./components/Breadcrumb.md) — `<nav>`, 2 properties, 0 events.
- [Link](./components/Link.md) — `<a>`, 9 properties, 1 events.
- [Tabs](./components/Tabs.md) — `<div>`, 3 properties, 1 events.

## Guidance

- Start from the native widget contract and compose behavior through typed state, actions, content regions, and Visual roles.
- Preserve accessible names, keyboard behavior, focus visibility, deterministic SSR output, and stable collection identity.
- Do not maintain independent property or native-element maps in application code.
