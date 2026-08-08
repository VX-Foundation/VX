# Select

Select is a control widget lowered to `<select>` in client and SSR output.

## Canonical contract

```vx
#script
  prop field: Optional<String>
  prop value: Optional<String>
  prop options: List<Any>
  prop placeholder: Optional<String>
  prop disabled: Optional<Bool> = false
  prop required: Optional<Bool> = false
  prop multiple: Optional<Bool> = false
  prop name: Optional<String>
  prop size: Optional<String> = "medium"
  prop error: Optional<String>
  prop helperText: Optional<String>
  prop change: Optional<Event<String>>
  prop focus: Optional<Event<Void>>
  prop blur: Optional<Event<Void>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `control` |
| Native element | `<select>` |
| Call property | `value` |
| Groups | `control`, `formControl`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `field` | `Optional<String>` | — | no |
| `value` | `Optional<String>` | — | no |
| `options` | `List<Any>` | — | yes |
| `placeholder` | `Optional<String>` | — | no |
| `disabled` | `Optional<Bool>` | `false` | no |
| `required` | `Optional<Bool>` | `false` | no |
| `multiple` | `Optional<Bool>` | `false` | no |
| `name` | `Optional<String>` | — | no |
| `size` | `Optional<String>` | `"medium"` | no |
| `error` | `Optional<String>` | — | no |
| `helperText` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `change` | `String` |
| `focus` | `Void` |
| `blur` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Select("value") {
    options: []
  }
#end view
```

## Production guidance

- Prefer Select over recreating its <select> contract through an untyped wrapper.
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
