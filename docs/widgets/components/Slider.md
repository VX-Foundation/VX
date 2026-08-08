# Slider

Slider is a control widget lowered to `<input>` in client and SSR output.

## Canonical contract

```vx
#script
  prop field: Optional<String>
  prop value: Optional<Float>
  prop min: Optional<Float> = 0
  prop max: Optional<Float> = 100
  prop step: Optional<Float> = 1
  prop disabled: Optional<Bool> = false
  prop orientation: Optional<String> = "horizontal"
  prop marks: Optional<Bool> = false
  prop color: Optional<String> = "primary"
  prop name: Optional<String>
  prop change: Optional<Event<Float>>
  prop dragStart: Optional<Event<Void>>
  prop dragEnd: Optional<Event<Float>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `control` |
| Native element | `<input>` |
| Call property | none |
| Groups | `control`, `formControl`, `interactive` |
| Runtime defaults | `{"type":"range"}` |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `field` | `Optional<String>` | — | no |
| `value` | `Optional<Float>` | — | no |
| `min` | `Optional<Float>` | `0` | no |
| `max` | `Optional<Float>` | `100` | no |
| `step` | `Optional<Float>` | `1` | no |
| `disabled` | `Optional<Bool>` | `false` | no |
| `orientation` | `Optional<String>` | `"horizontal"` | no |
| `marks` | `Optional<Bool>` | `false` | no |
| `color` | `Optional<String>` | `"primary"` | no |
| `name` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `change` | `Float` |
| `dragStart` | `Void` |
| `dragEnd` | `Float` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Slider
#end view
```

## Production guidance

- Prefer Slider over recreating its <input> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
- Keep server validation authoritative and reconcile field errors by stable field name.
