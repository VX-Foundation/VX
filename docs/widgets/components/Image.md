# Image

Image is a media widget lowered to `<img>` in client and SSR output.

## Canonical contract

```vx
#script
  prop src: String
  prop alt: Optional<String> = ""
  prop decorative: Optional<Bool> = false
  prop objectFit: Optional<String> = "cover"
  prop objectPosition: Optional<String> = "center"
  prop width: Optional<String>
  prop height: Optional<String>
  prop loading: Optional<String> = "lazy"
  prop crossOrigin: Optional<String>
  prop cornerRadius: Optional<String>
  prop fallbackSrc: Optional<String>
  prop load: Optional<Event<Void>>
  prop error: Optional<Event<Void>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `media` |
| Native element | `<img>` |
| Call property | none |
| Groups | `media` |
| Runtime defaults | `{"loading":"lazy","decoding":"async"}` |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `src` | `String` | — | yes |
| `alt` | `Optional<String>` | `""` | no |
| `decorative` | `Optional<Bool>` | `false` | no |
| `objectFit` | `Optional<String>` | `"cover"` | no |
| `objectPosition` | `Optional<String>` | `"center"` | no |
| `width` | `Optional<String>` | — | no |
| `height` | `Optional<String>` | — | no |
| `loading` | `Optional<String>` | `"lazy"` | no |
| `crossOrigin` | `Optional<String>` | — | no |
| `cornerRadius` | `Optional<String>` | — | no |
| `fallbackSrc` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `load` | `Void` |
| `error` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Image {
    src: "/media/example.png"
  }
#end view
```

## Production guidance

- Prefer Image over recreating its <img> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Use alt text for informative images and decorative: true only for decoration.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
