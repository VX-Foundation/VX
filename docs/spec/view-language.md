# View Language and Visual IR

The `#view` region describes semantic and visual intent with native widgets, component uses, control flow, collections, content projection, and `@roles`.

## Widgets

Native widgets are compiler-known contracts such as `View`, `Text`, `Title`, `Button`, `Input`, `Form`, `Image`, and `Link`.

## Roles

Roles are compiler metadata, not CSS classes. Roles may carry structural, semantic, visual, responsive, interaction, motion, layer, overlay, accessibility, direction, and writing-mode intent.

## Control flow

`if`, `when`, pattern matching, and keyed collections preserve identity according to their structural key. Removal MUST dispose resources owned by the removed branch.

## Styling

Scoped styles, global styles, CSS Modules, cascade layers, media queries, container queries, keyframes, critical extraction, code splitting, and dead-style elimination lower from Visual IR or the public styling API.

## Accessibility

Semantic output, accessible names, keyboard models, focus management, announcements, reduced motion, and contrast are compiler and runtime responsibilities. Invalid accessibility intent MUST produce actionable diagnostics.
