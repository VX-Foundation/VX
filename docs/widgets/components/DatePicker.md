# DatePicker

DatePicker is a control widget lowered to `<input>` in client and SSR output.

## Canonical contract

```vx
#script
  prop value: String = ""
  prop placeholder: String = "Select date..."
  prop label: String = "Select date"
  prop class: String = ""
  output onChange: String
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `control` |
| Native element | `<input>` |
| Call property | `value` |
| Groups | `control`, `formControl`, `interactive` |
| Runtime defaults | `{"type":"date"}` |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `value` | `String` | `""` | no |
| `placeholder` | `String` | `"Select date..."` | no |
| `label` | `String` | `"Select date"` | no |
| `class` | `String` | `""` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `onChange` | `String` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  DatePicker("value")
#end view
```

## Production guidance

- Prefer DatePicker over recreating its <input> contract through an untyped wrapper.
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
