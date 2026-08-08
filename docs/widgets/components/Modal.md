# Modal

Modal is a overlay widget lowered to `<dialog>` in client and SSR output.

## Canonical contract

```vx
#script
  prop open: Bool = false
  prop title: String = ""
  prop closeable: Bool = true
  prop class: String = ""
  output onClose: Void
  content default: optional
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `overlay` |
| Native element | `<dialog>` |
| Call property | none |
| Groups | `container`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `open` | `Bool` | `false` | no |
| `title` | `String` | `""` | no |
| `closeable` | `Bool` | `true` | no |
| `class` | `String` | `""` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `onClose` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| `default` | `optional` | no |

## Usage shape

```text
#view
  Modal {
    Text("Projected content")
  }
#end view
```

## Production guidance

- Prefer Modal over recreating its <dialog> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Restore focus to the invoker after closing.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
- Use keyed children when collection identity matters.
