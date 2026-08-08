# Form

Form is a form widget lowered to `<form>` in client and SSR output.

## Canonical contract

```vx
#script
  prop controller: Optional<Any>
  prop action: Optional<String>
  prop method: Optional<String> = "post"
  prop autocomplete: Optional<String>
  prop noValidate: Optional<Bool> = false
  prop submit: Optional<Event<Any>>
  prop reset: Optional<Event<Void>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `form` |
| Native element | `<form>` |
| Call property | none |
| Groups | `container` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `controller` | `Optional<Any>` | — | no |
| `action` | `Optional<String>` | — | no |
| `method` | `Optional<String>` | `"post"` | no |
| `autocomplete` | `Optional<String>` | — | no |
| `noValidate` | `Optional<Bool>` | `false` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `submit` | `Any` |
| `reset` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Form
#end view
```

## Production guidance

- Prefer Form over recreating its <form> contract through an untyped wrapper.
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
