# IFrame

IFrame is a media widget lowered to `<iframe>` in client and SSR output.

## Canonical contract

```vx
#script
  prop src: String
  prop title: Optional<String>
  prop width: Optional<String> = "100%"
  prop height: Optional<String> = "100%"
  prop loading: Optional<String> = "lazy"
  prop allowFullScreen: Optional<Bool> = false
  prop allow: Optional<String>
  prop referrerPolicy: Optional<String>
  prop sandbox: Optional<String>
  prop trusted: Optional<Bool> = false
  prop load: Optional<Event<Void>>
  prop error: Optional<Event<String>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `media` |
| Native element | `<iframe>` |
| Call property | none |
| Groups | `media` |
| Runtime defaults | `{"loading":"lazy","referrerPolicy":"strict-origin-when-cross-origin","sandbox":""}` |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `src` | `String` | — | yes |
| `title` | `Optional<String>` | — | no |
| `width` | `Optional<String>` | `"100%"` | no |
| `height` | `Optional<String>` | `"100%"` | no |
| `loading` | `Optional<String>` | `"lazy"` | no |
| `allowFullScreen` | `Optional<Bool>` | `false` | no |
| `allow` | `Optional<String>` | — | no |
| `referrerPolicy` | `Optional<String>` | — | no |
| `sandbox` | `Optional<String>` | — | no |
| `trusted` | `Optional<Bool>` | `false` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `load` | `Void` |
| `error` | `String` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  IFrame {
    src: "/media/example.png"
  }
#end view
```

## Production guidance

- Prefer IFrame over recreating its <iframe> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Provide title and explicit sandbox or trusted policy.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
