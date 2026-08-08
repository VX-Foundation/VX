# Canvas

Canvas is a media widget lowered to `<canvas>` in client and SSR output.

## Canonical contract

```vx
#script
  prop width: String
  prop height: String
  prop contextType: Optional<String> = "2d"
  prop ready: Optional<Event<Any>>
  prop click: Optional<Event<Any>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `media` |
| Native element | `<canvas>` |
| Call property | none |
| Groups | `media` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `width` | `String` | — | yes |
| `height` | `String` | — | yes |
| `contextType` | `Optional<String>` | `"2d"` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `ready` | `Any` |
| `click` | `Any` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Canvas {
    width: "320"
    height: "180"
  }
#end view
```

## Production guidance

- Prefer Canvas over recreating its <canvas> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
