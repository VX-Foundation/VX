# Title

Title is a text widget lowered to `<h1>` in client and SSR output.

## Canonical contract

```vx
#script
  prop text: String
  prop level: Optional<Int> = 1
  prop id: Optional<String>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `text` |
| Native element | `<h1>` |
| Call property | `text` |
| Groups | `text` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `text` | `String` | — | yes |
| `level` | `Optional<Int>` | `1` | no |
| `id` | `Optional<String>` | — | no |

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
  Title("Example") {
  }
#end view
```

## Production guidance

- Prefer Title over recreating its <h1> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
