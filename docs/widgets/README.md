# Native widgets

VX exposes 43 canonical native widgets. Contracts are generated from primitive .vx sources and semantic metadata from the canonical registry.

## Categories

### Composite

- [Accordion](./components/Accordion.md) — native `<details>`, 4 properties, 1 events.

### Control

- [Button](./components/Button.md) — native `<button>`, 13 properties, 3 events.
- [Checkbox](./components/Checkbox.md) — native `<input>`, 14 properties, 3 events.
- [DatePicker](./components/DatePicker.md) — native `<input>`, 5 properties, 1 events.
- [FileUpload](./components/FileUpload.md) — native `<input>`, 4 properties, 1 events.
- [Input](./components/Input.md) — native `<input>`, 23 properties, 5 events.
- [Radio](./components/Radio.md) — native `<input>`, 11 properties, 1 events.
- [Select](./components/Select.md) — native `<select>`, 14 properties, 3 events.
- [Slider](./components/Slider.md) — native `<input>`, 13 properties, 3 events.
- [Switch](./components/Switch.md) — native `<input>`, 9 properties, 1 events.
- [TextArea](./components/TextArea.md) — native `<textarea>`, 18 properties, 4 events.

### Data

- [DataTable](./components/DataTable.md) — native `<table>`, 1 properties, 0 events.
- [List](./components/List.md) — native `<ul>`, 10 properties, 2 events.
- [VirtualList](./components/VirtualList.md) — native `<div>`, 2 properties, 0 events.

### Display

- [Avatar](./components/Avatar.md) — native `<span>`, 4 properties, 0 events.
- [Badge](./components/Badge.md) — native `<span>`, 3 properties, 0 events.
- [Icon](./components/Icon.md) — native `<span>`, 9 properties, 1 events.

### Feedback

- [ErrorSummary](./components/ErrorSummary.md) — native `<div>`, 3 properties, 0 events.
- [FieldError](./components/FieldError.md) — native `<span>`, 2 properties, 0 events.
- [FormError](./components/FormError.md) — native `<div>`, 2 properties, 0 events.
- [ProgressBar](./components/ProgressBar.md) — native `<progress>`, 6 properties, 0 events.
- [Skeleton](./components/Skeleton.md) — native `<div>`, 3 properties, 0 events.
- [Spinner](./components/Spinner.md) — native `<span>`, 2 properties, 0 events.
- [Toast](./components/Toast.md) — native `<div>`, 6 properties, 1 events.
- [Tooltip](./components/Tooltip.md) — native `<span>`, 3 properties, 0 events.

### Form

- [FieldGroup](./components/FieldGroup.md) — native `<fieldset>`, 3 properties, 0 events.
- [Form](./components/Form.md) — native `<form>`, 7 properties, 2 events.

### Layout

- [Divider](./components/Divider.md) — native `<hr>`, 5 properties, 0 events.
- [ScrollView](./components/ScrollView.md) — native `<div>`, 15 properties, 3 events.
- [View](./components/View.md) — native `<div>`, 25 properties, 3 events.

### Media

- [Audio](./components/Audio.md) — native `<audio>`, 10 properties, 4 events.
- [Canvas](./components/Canvas.md) — native `<canvas>`, 5 properties, 2 events.
- [IFrame](./components/IFrame.md) — native `<iframe>`, 12 properties, 2 events.
- [Image](./components/Image.md) — native `<img>`, 13 properties, 2 events.
- [Video](./components/Video.md) — native `<video>`, 17 properties, 5 events.

### Navigation

- [Breadcrumb](./components/Breadcrumb.md) — native `<nav>`, 2 properties, 0 events.
- [Link](./components/Link.md) — native `<a>`, 9 properties, 1 events.
- [Tabs](./components/Tabs.md) — native `<div>`, 3 properties, 1 events.

### Overlay

- [Drawer](./components/Drawer.md) — native `<aside>`, 5 properties, 1 events.
- [Modal](./components/Modal.md) — native `<dialog>`, 5 properties, 1 events.
- [Popover](./components/Popover.md) — native `<div>`, 3 properties, 1 events.

### Text

- [Text](./components/Text.md) — native `<span>`, 14 properties, 0 events.
- [Title](./components/Title.md) — native `<h1>`, 3 properties, 0 events.

## Contract policy

- Widget names, native elements, properties, events, content regions, defaults, compiler validation, DOM lowering, SSR lowering, tooling metadata, snippets, and this reference derive from the same registry.
- Unknown properties and events are diagnostics.
- Client and SSR lowering must preserve the same native element and widget identity.
- Run `pnpm widgets:generate`, `pnpm widgets:check`, and `pnpm widgets:verify-lowering` after contract changes.
