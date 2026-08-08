# Toast

Toast is a feedback widget lowered to `<div>` in client and SSR output.

## Canonical contract

```vx
#script
  prop title: String = ""
  prop message: String = ""
  prop variant: String = "info"
  prop visible: Bool = true
  prop class: String = ""
  output onDismiss: Void
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `feedback` |
| Native element | `<div>` |
| Call property | none |
| Groups | `container` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `title` | `String` | `""` | no |
| `message` | `String` | `""` | no |
| `variant` | `String` | `"info"` | no |
| `visible` | `Bool` | `true` | no |
| `class` | `String` | `""` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `onDismiss` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Toast
#end view
```

## Production guidance

- Prefer Toast over recreating its <div> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
- Use keyed children when collection identity matters.
