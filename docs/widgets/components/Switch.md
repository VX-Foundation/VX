# Switch

Switch is a control widget lowered to `<input>` in client and SSR output.

## Canonical contract

```vx
#script
  prop field: Optional<String>
  prop checked: Optional<Bool>
  prop disabled: Optional<Bool> = false
  prop label: Optional<String>
  prop labelPlacement: Optional<String> = "end"
  prop size: Optional<String> = "medium"
  prop color: Optional<String> = "primary"
  prop name: Optional<String>
  prop change: Optional<Event<Bool>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `control` |
| Native element | `<input>` |
| Call property | none |
| Groups | `control`, `formControl`, `interactive` |
| Runtime defaults | `{"type":"checkbox","role":"switch"}` |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `field` | `Optional<String>` | — | no |
| `checked` | `Optional<Bool>` | — | no |
| `disabled` | `Optional<Bool>` | `false` | no |
| `label` | `Optional<String>` | — | no |
| `labelPlacement` | `Optional<String>` | `"end"` | no |
| `size` | `Optional<String>` | `"medium"` | no |
| `color` | `Optional<String>` | `"primary"` | no |
| `name` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `change` | `Bool` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Switch
#end view
```

## Production guidance

- Prefer Switch over recreating its <input> contract through an untyped wrapper.
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
