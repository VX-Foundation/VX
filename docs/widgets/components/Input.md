# Input

Input is a control widget lowered to `<input>` in client and SSR output.

## Canonical contract

```vx
#script
  prop field: Optional<String>
  prop value: Optional<String>
  prop type: Optional<String> = "text"
  prop placeholder: Optional<String> = ""
  prop label: Optional<String>
  prop disabled: Optional<Bool> = false
  prop readonly: Optional<Bool> = false
  prop required: Optional<Bool> = false
  prop name: Optional<String>
  prop autoComplete: Optional<String>
  prop autoFocus: Optional<Bool> = false
  prop accept: Optional<String>
  prop ariaLabel: Optional<String>
  prop maxLength: Optional<Int>
  prop minLength: Optional<Int>
  prop pattern: Optional<String>
  prop error: Optional<String>
  prop helperText: Optional<String>
  prop change: Optional<Event<String>>
  prop focus: Optional<Event<Void>>
  prop blur: Optional<Event<Void>>
  prop keyDown: Optional<Event<String>>
  prop keyUp: Optional<Event<String>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `control` |
| Native element | `<input>` |
| Call property | `value` |
| Groups | `control`, `formControl`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `field` | `Optional<String>` | — | no |
| `value` | `Optional<String>` | — | no |
| `type` | `Optional<String>` | `"text"` | no |
| `placeholder` | `Optional<String>` | `""` | no |
| `label` | `Optional<String>` | — | no |
| `disabled` | `Optional<Bool>` | `false` | no |
| `readonly` | `Optional<Bool>` | `false` | no |
| `required` | `Optional<Bool>` | `false` | no |
| `name` | `Optional<String>` | — | no |
| `autoComplete` | `Optional<String>` | — | no |
| `autoFocus` | `Optional<Bool>` | `false` | no |
| `accept` | `Optional<String>` | — | no |
| `ariaLabel` | `Optional<String>` | — | no |
| `maxLength` | `Optional<Int>` | — | no |
| `minLength` | `Optional<Int>` | — | no |
| `pattern` | `Optional<String>` | — | no |
| `error` | `Optional<String>` | — | no |
| `helperText` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `change` | `String` |
| `focus` | `Void` |
| `blur` | `Void` |
| `keyDown` | `String` |
| `keyUp` | `String` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Input("value")
#end view
```

## Production guidance

- Prefer Input over recreating its <input> contract through an untyped wrapper.
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
