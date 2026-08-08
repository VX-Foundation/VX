# Drawer

Drawer is a overlay widget lowered to `<aside>` in client and SSR output.

## Canonical contract

```vx
#script
  prop open: Bool = false
  prop title: String = ""
  prop side: String = "right"
  prop class: String = ""
  output onClose: Void
  content default: optional
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `overlay` |
| Native element | `<aside>` |
| Call property | none |
| Groups | `container`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `open` | `Bool` | `false` | no |
| `title` | `String` | `""` | no |
| `side` | `String` | `"right"` | no |
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
  Drawer {
    Text("Projected content")
  }
#end view
```

## Production guidance

- Prefer Drawer over recreating its <aside> contract through an untyped wrapper.
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
