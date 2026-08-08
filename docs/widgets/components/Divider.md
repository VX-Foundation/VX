# Divider

Divider is a layout widget lowered to `<hr>` in client and SSR output.

## Canonical contract

```vx
#script
  prop orientation: Optional<String> = "horizontal"
  prop thickness: Optional<String> = "1px"
  prop color: Optional<String>
  prop margin: Optional<String>
  prop variant: Optional<String> = "solid"
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `layout` |
| Native element | `<hr>` |
| Call property | none |
| Groups | none |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `orientation` | `Optional<String>` | `"horizontal"` | no |
| `thickness` | `Optional<String>` | `"1px"` | no |
| `color` | `Optional<String>` | — | no |
| `margin` | `Optional<String>` | — | no |
| `variant` | `Optional<String>` | `"solid"` | no |

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
  Divider
#end view
```

## Production guidance

- Prefer Divider over recreating its <hr> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
