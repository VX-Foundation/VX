# FieldGroup

FieldGroup is a form widget lowered to `<fieldset>` in client and SSR output.

## Canonical contract

```vx
#script
  prop label: Optional<String>
  prop description: Optional<String>
  prop required: Optional<Bool> = false
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `form` |
| Native element | `<fieldset>` |
| Call property | none |
| Groups | `container` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `label` | `Optional<String>` | — | no |
| `description` | `Optional<String>` | — | no |
| `required` | `Optional<Bool>` | `false` | no |

## Events and outputs

| Name | Payload |
|---|---|
| — | — |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  FieldGroup
#end view
```

## Production guidance

- Prefer FieldGroup over recreating its <fieldset> contract through an untyped wrapper.
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
