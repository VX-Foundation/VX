# View

View is a layout widget lowered to `<div>` in client and SSR output.

## Canonical contract

```vx
#script
  prop layout: Optional<String> = "column"
  prop align: Optional<String> = "stretch"
  prop justify: Optional<String> = "start"
  prop spacing: Optional<Int> = 0
  prop wrap: Optional<Bool> = false
  prop width: Optional<String>
  prop height: Optional<String>
  prop minWidth: Optional<String>
  prop minHeight: Optional<String>
  prop maxWidth: Optional<String>
  prop maxHeight: Optional<String>
  prop padding: Optional<String>
  prop margin: Optional<String>
  prop background: Optional<String>
  prop cornerRadius: Optional<String>
  prop border: Optional<String>
  prop shadow: Optional<String>
  prop opacity: Optional<Float>
  prop overflow: Optional<String>
  prop position: Optional<String>
  prop zIndex: Optional<Int>
  prop cursor: Optional<String>
  prop click: Optional<Event<Void>>
  prop mouseEnter: Optional<Event<Void>>
  prop mouseLeave: Optional<Event<Void>>
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
| `layout` | `Optional<String>` | `"column"` | no |
| `align` | `Optional<String>` | `"stretch"` | no |
| `justify` | `Optional<String>` | `"start"` | no |
| `spacing` | `Optional<Int>` | `0` | no |
| `wrap` | `Optional<Bool>` | `false` | no |
| `width` | `Optional<String>` | — | no |
| `height` | `Optional<String>` | — | no |
| `minWidth` | `Optional<String>` | — | no |
| `minHeight` | `Optional<String>` | — | no |
| `maxWidth` | `Optional<String>` | — | no |
| `maxHeight` | `Optional<String>` | — | no |
| `padding` | `Optional<String>` | — | no |
| `margin` | `Optional<String>` | — | no |
| `background` | `Optional<String>` | — | no |
| `cornerRadius` | `Optional<String>` | — | no |
| `border` | `Optional<String>` | — | no |
| `shadow` | `Optional<String>` | — | no |
| `opacity` | `Optional<Float>` | — | no |
| `overflow` | `Optional<String>` | — | no |
| `position` | `Optional<String>` | — | no |
| `zIndex` | `Optional<Int>` | — | no |
| `cursor` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `click` | `Void` |
| `mouseEnter` | `Void` |
| `mouseLeave` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  View
#end view
```

## Production guidance

- Prefer View over recreating its <div> contract through an untyped wrapper.
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
