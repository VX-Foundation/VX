# ProgressBar

ProgressBar is a feedback widget lowered to `<progress>` in client and SSR output.

## Canonical contract

```vx
#script
  prop value: Float
  prop max: Optional<Float> = 100
  prop variant: Optional<String> = "determinate"
  prop size: Optional<String> = "medium"
  prop color: Optional<String> = "primary"
  prop showLabel: Optional<Bool> = false
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `feedback` |
| Native element | `<progress>` |
| Call property | none |
| Groups | none |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `value` | `Float` | — | yes |
| `max` | `Optional<Float>` | `100` | no |
| `variant` | `Optional<String>` | `"determinate"` | no |
| `size` | `Optional<String>` | `"medium"` | no |
| `color` | `Optional<String>` | `"primary"` | no |
| `showLabel` | `Optional<Bool>` | `false` | no |

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
  ProgressBar {
    value: 50.0
  }
#end view
```

## Production guidance

- Prefer ProgressBar over recreating its <progress> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
