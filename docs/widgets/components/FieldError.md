# FieldError

FieldError is a feedback widget lowered to `<span>` in client and SSR output.

## Canonical contract

```vx
#script
  prop field: String
  prop role: Optional<String> = "alert"
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `feedback` |
| Native element | `<span>` |
| Call property | none |
| Groups | `text` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `field` | `String` | — | yes |
| `role` | `Optional<String>` | `"alert"` | no |

## Events and outputs

| Name | Payload |
|---|---|
| — | — |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  FieldError {
    field: "Field"
  }
#end view
```

## Production guidance

- Prefer FieldError over recreating its <span> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
