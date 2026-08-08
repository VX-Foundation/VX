# Checkbox

Checkbox is a control widget lowered to `<input>` in client and SSR output.

## Canonical contract

```vx
#script
  prop field: Optional<String>
  prop checked: Optional<Bool>
  prop label: Optional<String>
  prop disabled: Optional<Bool> = false
  prop required: Optional<Bool> = false
  prop indeterminate: Optional<Bool> = false
  prop name: Optional<String>
  prop value: Optional<String>
  prop size: Optional<String> = "medium"
  prop color: Optional<String> = "primary"
  prop error: Optional<String>
  prop change: Optional<Event<Bool>>
  prop focus: Optional<Event<Void>>
  prop blur: Optional<Event<Void>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `control` |
| Native element | `<input>` |
| Call property | none |
| Groups | `control`, `formControl`, `interactive` |
| Runtime defaults | `{"type":"checkbox"}` |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `field` | `Optional<String>` | — | no |
| `checked` | `Optional<Bool>` | — | no |
| `label` | `Optional<String>` | — | no |
| `disabled` | `Optional<Bool>` | `false` | no |
| `required` | `Optional<Bool>` | `false` | no |
| `indeterminate` | `Optional<Bool>` | `false` | no |
| `name` | `Optional<String>` | — | no |
| `value` | `Optional<String>` | — | no |
| `size` | `Optional<String>` | `"medium"` | no |
| `color` | `Optional<String>` | `"primary"` | no |
| `error` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `change` | `Bool` |
| `focus` | `Void` |
| `blur` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Checkbox
#end view
```

## Production guidance

- Prefer Checkbox over recreating its <input> contract through an untyped wrapper.
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
