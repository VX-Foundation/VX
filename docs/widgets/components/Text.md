# Text

Text is a text widget lowered to `<span>` in client and SSR output.

## Canonical contract

```vx
#script
  prop text: String
  prop size: Optional<String>
  prop weight: Optional<String> = "normal"
  prop color: Optional<String>
  prop align: Optional<String> = "left"
  prop lineHeight: Optional<String>
  prop letterSpacing: Optional<String>
  prop textDecoration: Optional<String>
  prop textTransform: Optional<String>
  prop fontFamily: Optional<String>
  prop maxLines: Optional<Int>
  prop truncate: Optional<Bool> = false
  prop selectable: Optional<Bool> = true
  prop margin: Optional<String>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `text` |
| Native element | `<span>` |
| Call property | `text` |
| Groups | `text` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `text` | `String` | — | yes |
| `size` | `Optional<String>` | — | no |
| `weight` | `Optional<String>` | `"normal"` | no |
| `color` | `Optional<String>` | — | no |
| `align` | `Optional<String>` | `"left"` | no |
| `lineHeight` | `Optional<String>` | — | no |
| `letterSpacing` | `Optional<String>` | — | no |
| `textDecoration` | `Optional<String>` | — | no |
| `textTransform` | `Optional<String>` | — | no |
| `fontFamily` | `Optional<String>` | — | no |
| `maxLines` | `Optional<Int>` | — | no |
| `truncate` | `Optional<Bool>` | `false` | no |
| `selectable` | `Optional<Bool>` | `true` | no |
| `margin` | `Optional<String>` | — | no |

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
  Text("Example") {
  }
#end view
```

## Production guidance

- Prefer Text over recreating its <span> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
