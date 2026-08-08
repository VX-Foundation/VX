# Icon

Icon is a display widget lowered to `<span>` in client and SSR output.

## Canonical contract

```vx
#script
  prop name: String
  prop size: Optional<String> = "24px"
  prop color: Optional<String> = "currentColor"
  prop decorative: Optional<Bool> = true
  prop weight: Optional<String>
  prop variant: Optional<String> = "outline"
  prop strokeWidth: Optional<Float>
  prop viewBox: Optional<String>
  prop click: Optional<Event<Void>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `display` |
| Native element | `<span>` |
| Call property | none |
| Groups | `media` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `name` | `String` | — | yes |
| `size` | `Optional<String>` | `"24px"` | no |
| `color` | `Optional<String>` | `"currentColor"` | no |
| `decorative` | `Optional<Bool>` | `true` | no |
| `weight` | `Optional<String>` | — | no |
| `variant` | `Optional<String>` | `"outline"` | no |
| `strokeWidth` | `Optional<Float>` | — | no |
| `viewBox` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `click` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Icon {
    name: "field"
  }
#end view
```

## Production guidance

- Prefer Icon over recreating its <span> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
