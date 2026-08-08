# Video

Video is a media widget lowered to `<video>` in client and SSR output.

## Canonical contract

```vx
#script
  prop src: String
  prop poster: Optional<String>
  prop autoPlay: Optional<Bool> = false
  prop controls: Optional<Bool> = true
  prop loop: Optional<Bool> = false
  prop muted: Optional<Bool> = false
  prop playsInline: Optional<Bool> = true
  prop preload: Optional<String> = "metadata"
  prop width: Optional<String>
  prop height: Optional<String>
  prop objectFit: Optional<String> = "cover"
  prop cornerRadius: Optional<String>
  prop play: Optional<Event<Void>>
  prop pause: Optional<Event<Void>>
  prop end: Optional<Event<Void>>
  prop timeUpdate: Optional<Event<Float>>
  prop error: Optional<Event<String>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `media` |
| Native element | `<video>` |
| Call property | none |
| Groups | `media`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `src` | `String` | — | yes |
| `poster` | `Optional<String>` | — | no |
| `autoPlay` | `Optional<Bool>` | `false` | no |
| `controls` | `Optional<Bool>` | `true` | no |
| `loop` | `Optional<Bool>` | `false` | no |
| `muted` | `Optional<Bool>` | `false` | no |
| `playsInline` | `Optional<Bool>` | `true` | no |
| `preload` | `Optional<String>` | `"metadata"` | no |
| `width` | `Optional<String>` | — | no |
| `height` | `Optional<String>` | — | no |
| `objectFit` | `Optional<String>` | `"cover"` | no |
| `cornerRadius` | `Optional<String>` | — | no |

## Events and outputs

| Name | Payload |
|---|---|
| `play` | `Void` |
| `pause` | `Void` |
| `end` | `Void` |
| `timeUpdate` | `Float` |
| `error` | `String` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Video {
    src: "/media/example.png"
  }
#end view
```

## Production guidance

- Prefer Video over recreating its <video> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
