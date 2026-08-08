# Avatar

Avatar is a display widget lowered to `<span>` in client and SSR output.

## Canonical contract

```vx
#script
  prop name: String = "User"
  prop src: String = ""
  prop size: String = "md"
  prop class: String = ""
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `display` |
| Native element | `<span>` |
| Call property | none |
| Groups | `text` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `name` | `String` | `"User"` | no |
| `src` | `String` | `""` | no |
| `size` | `String` | `"md"` | no |
| `class` | `String` | `""` | no |

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
  Avatar
#end view
```

## Production guidance

- Prefer Avatar over recreating its <span> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
