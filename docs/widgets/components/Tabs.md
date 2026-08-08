# Tabs

Tabs is a navigation widget lowered to `<div>` in client and SSR output.

## Canonical contract

```vx
#script
  prop activeTab: String = ""
  prop class: String = ""
  output onTabChange: String
  content default: optional
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `navigation` |
| Native element | `<div>` |
| Call property | none |
| Groups | `container`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `activeTab` | `String` | `""` | no |
| `class` | `String` | `""` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `onTabChange` | `String` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| `default` | `optional` | no |

## Usage shape

```text
#view
  Tabs {
    Text("Projected content")
  }
#end view
```

## Production guidance

- Prefer Tabs over recreating its <div> contract through an untyped wrapper.
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
