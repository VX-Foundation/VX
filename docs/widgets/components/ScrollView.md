# ScrollView

ScrollView is a layout widget lowered to `<div>` in client and SSR output.

## Canonical contract

```vx
#script
  prop direction: Optional<String> = "vertical"
  prop showsIndicators: Optional<Bool> = true
  prop padding: Optional<String>
  prop margin: Optional<String>
  prop background: Optional<String>
  prop width: Optional<String>
  prop height: Optional<String>
  prop maxHeight: Optional<String>
  prop maxWidth: Optional<String>
  prop contentContainerStyle: Optional<String>
  prop scrollEventThrottle: Optional<Int> = 16
  prop bounces: Optional<Bool> = true
  prop scroll: Optional<Event<Any>>
  prop scrollBeginDrag: Optional<Event<Void>>
  prop scrollEndDrag: Optional<Event<Void>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `layout` |
| Native element | `<div>` |
| Call property | none |
| Groups | `container` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `direction` | `Optional<String>` | `"vertical"` | no |
| `showsIndicators` | `Optional<Bool>` | `true` | no |
| `padding` | `Optional<String>` | — | no |
| `margin` | `Optional<String>` | — | no |
| `background` | `Optional<String>` | — | no |
| `width` | `Optional<String>` | — | no |
| `height` | `Optional<String>` | — | no |
| `maxHeight` | `Optional<String>` | — | no |
| `maxWidth` | `Optional<String>` | — | no |
| `contentContainerStyle` | `Optional<String>` | — | no |
| `scrollEventThrottle` | `Optional<Int>` | `16` | no |
| `bounces` | `Optional<Bool>` | `true` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `scroll` | `Any` |
| `scrollBeginDrag` | `Void` |
| `scrollEndDrag` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  ScrollView
#end view
```

## Production guidance

- Prefer ScrollView over recreating its <div> contract through an untyped wrapper.
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
