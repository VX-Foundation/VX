# Accordion

Accordion is a composite widget lowered to `<details>` in client and SSR output.

## Canonical contract

```vx
#script
  prop title: String = ""
  prop expanded: Bool = false
  prop class: String = ""
  output onToggle: Void
  content default: optional
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `composite` |
| Native element | `<details>` |
| Call property | `title` |
| Groups | `container`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `title` | `String` | `""` | no |
| `expanded` | `Bool` | `false` | no |
| `class` | `String` | `""` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `onToggle` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| `default` | `optional` | no |

## Usage shape

```text
#view
  Accordion("Example") {
    Text("Projected content")
  }
#end view
```

## Production guidance

- Prefer Accordion over recreating its <details> contract through an untyped wrapper.
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
