# Audio

Audio is a media widget lowered to `<audio>` in client and SSR output.

## Canonical contract

```vx
#script
  prop src: String
  prop autoPlay: Optional<Bool> = false
  prop controls: Optional<Bool> = true
  prop loop: Optional<Bool> = false
  prop muted: Optional<Bool> = false
  prop preload: Optional<String> = "metadata"
  prop play: Optional<Event<Void>>
  prop pause: Optional<Event<Void>>
  prop end: Optional<Event<Void>>
  prop timeUpdate: Optional<Event<Float>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `media` |
| Native element | `<audio>` |
| Call property | none |
| Groups | `media`, `interactive` |
| Runtime defaults | none |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `src` | `String` | — | yes |
| `autoPlay` | `Optional<Bool>` | `false` | no |
| `controls` | `Optional<Bool>` | `true` | no |
| `loop` | `Optional<Bool>` | `false` | no |
| `muted` | `Optional<Bool>` | `false` | no |
| `preload` | `Optional<String>` | `"metadata"` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `play` | `Void` |
| `pause` | `Void` |
| `end` | `Void` |
| `timeUpdate` | `Float` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  Audio {
    src: "/media/example.png"
  }
#end view
```

## Production guidance

- Prefer Audio over recreating its <audio> contract through an untyped wrapper.
- Use Visual roles for appearance and layout instead of introducing independent widget-specific CSS maps.
- Bind only documented properties and events; unknown inputs are compiler diagnostics.
- Cover normal, loading, empty, error, disabled, and reduced-motion behavior when relevant.
- Provide a meaningful accessible name.
- Verify keyboard-only operation and visible focus.
- Test invalid, disabled, loading, and empty states where supported.
- Keep property values deterministic between server and client.
- Avoid unnecessary client hydration for static output.
- Dispose event, observer, timer, and subscription ownership when the widget leaves the tree.
