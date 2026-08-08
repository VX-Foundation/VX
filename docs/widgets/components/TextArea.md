# TextArea

TextArea is a control widget lowered to `<textarea>` in client and SSR output.

## Canonical contract

```vx
#script
  prop field: Optional<String>
  prop value: Optional<String>
  prop placeholder: Optional<String> = ""
  prop rows: Optional<Int> = 3
  prop minRows: Optional<Int>
  prop maxRows: Optional<Int>
  prop disabled: Optional<Bool> = false
  prop readonly: Optional<Bool> = false
  prop required: Optional<Bool> = false
  prop maxLength: Optional<Int>
  prop resize: Optional<String> = "none"
  prop name: Optional<String>
  prop error: Optional<String>
  prop helperText: Optional<String>
  prop change: Optional<Event<String>>
  prop focus: Optional<Event<Void>>
  prop blur: Optional<Event<Void>>
  prop keyDown: Optional<Event<String>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `control` |
| Native element | `<textarea>` |
| Call property | `value` |
| Groups | `control`, `formControl`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `field` | `Optional<String>` | — | no |
| `value` | `Optional<String>` | — | no |
| `placeholder` | `Optional<String>` | `""` | no |
| `rows` | `Optional<Int>` | `3` | no |
| `minRows` | `Optional<Int>` | — | no |
| `maxRows` | `Optional<Int>` | — | no |
| `disabled` | `Optional<Bool>` | `false` | no |
| `readonly` | `Optional<Bool>` | `false` | no |
| `required` | `Optional<Bool>` | `false` | no |
| `maxLength` | `Optional<Int>` | — | no |
| `resize` | `Optional<String>` | `"none"` | no |
| `name` | `Optional<String>` | — | no |
| `error` | `Optional<String>` | — | no |
| `helperText` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `change` | `String` |
| `focus` | `Void` |
| `blur` | `Void` |
| `keyDown` | `String` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  TextArea("value")
#end view
```

## Production guidance

- Prefer TextArea over recreating its <textarea> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
- Keep server validation authoritative and reconcile field errors by stable field name.
