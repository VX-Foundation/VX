# FORMS

This guide groups 12 canonical widgets used for control, form scenarios.

## Widgets

- [Button](./components/Button.md) — `<button>`, 13 properties, 3 events.
- [Checkbox](./components/Checkbox.md) — `<input>`, 14 properties, 3 events.
- [DatePicker](./components/DatePicker.md) — `<input>`, 5 properties, 1 events.
- [FieldGroup](./components/FieldGroup.md) — `<fieldset>`, 3 properties, 0 events.
- [FileUpload](./components/FileUpload.md) — `<input>`, 4 properties, 1 events.
- [Form](./components/Form.md) — `<form>`, 7 properties, 2 events.
- [Input](./components/Input.md) — `<input>`, 23 properties, 5 events.
- [Radio](./components/Radio.md) — `<input>`, 11 properties, 1 events.
- [Select](./components/Select.md) — `<select>`, 14 properties, 3 events.
- [Slider](./components/Slider.md) — `<input>`, 13 properties, 3 events.
- [Switch](./components/Switch.md) — `<input>`, 9 properties, 1 events.
- [TextArea](./components/TextArea.md) — `<textarea>`, 18 properties, 4 events.

## Guidance

- Start from the native widget contract and compose behavior through typed state, actions, content regions, and Visual roles.
- Preserve accessible names, keyboard behavior, focus visibility, deterministic SSR output, and stable collection identity.
- Do not maintain independent property or native-element maps in application code.
