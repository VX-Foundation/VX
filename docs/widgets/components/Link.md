# Link

Link is a navigation widget lowered to `<a>` in client and SSR output.

## Canonical contract

```vx
#script
  prop href: String
  prop text: Optional<String>
  prop target: Optional<String> = "_self"
  prop rel: Optional<String>
  prop color: Optional<String>
  prop underline: Optional<String> = "hover"
  prop size: Optional<String>
  prop weight: Optional<String>
  prop click: Optional<Event<Void>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `navigation` |
| Native element | `<a>` |
| Call property | `text` |
| Groups | `text`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `href` | `String` | — | yes |
| `text` | `Optional<String>` | — | no |
| `target` | `Optional<String>` | `"_self"` | no |
| `rel` | `Optional<String>` | — | no |
| `color` | `Optional<String>` | — | no |
| `underline` | `Optional<String>` | `"hover"` | no |
| `size` | `Optional<String>` | — | no |
| `weight` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `click` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Link("Example") {
    href: "/account"
  }
#end view
```

## Production guidance

- Prefer Link over recreating its <a> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
