# Button

Button is a control widget lowered to `<button>` in client and SSR output.

## Canonical contract

```vx
#script
  prop label: Optional<String>
  prop variant: Optional<String> = "primary"
  prop size: Optional<String> = "medium"
  prop disabled: Optional<Bool> = false
  prop loading: Optional<Bool> = false
  prop fullWidth: Optional<Bool> = false
  prop type: Optional<String> = "button"
  prop iconLeft: Optional<String>
  prop iconRight: Optional<String>
  prop form: Optional<String>
  prop click: Optional<Event<Void>>
  prop focus: Optional<Event<Void>>
  prop blur: Optional<Event<Void>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `control` |
| Native element | `<button>` |
| Call property | `label` |
| Groups | `control`, `interactive`, `text` |
| Runtime defaults | `{"type":"button"}` |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `label` | `Optional<String>` | — | no |
| `variant` | `Optional<String>` | `"primary"` | no |
| `size` | `Optional<String>` | `"medium"` | no |
| `disabled` | `Optional<Bool>` | `false` | no |
| `loading` | `Optional<Bool>` | `false` | no |
| `fullWidth` | `Optional<Bool>` | `false` | no |
| `type` | `Optional<String>` | `"button"` | no |
| `iconLeft` | `Optional<String>` | — | no |
| `iconRight` | `Optional<String>` | — | no |
| `form` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `click` | `Void` |
| `focus` | `Void` |
| `blur` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Button("Continue")
#end view
```

## Production guidance

- Prefer Button over recreating its <button> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
