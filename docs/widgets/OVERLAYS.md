# OVERLAYS

This guide groups 3 canonical widgets used for overlay scenarios.

## Widgets

- [Drawer](./components/Drawer.md) — `<aside>`, 5 properties, 1 events.
- [Modal](./components/Modal.md) — `<dialog>`, 5 properties, 1 events.
- [Popover](./components/Popover.md) — `<div>`, 3 properties, 1 events.

## Guidance

- Start from the native widget contract and compose behavior through typed state, actions, content regions, and Visual roles.
- Preserve accessible names, keyboard behavior, focus visibility, deterministic SSR output, and stable collection identity.
- Do not maintain independent property or native-element maps in application code.
