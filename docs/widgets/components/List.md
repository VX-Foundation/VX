# List

List is a data widget lowered to `<ul>` in client and SSR output.

## Canonical contract

```vx
#script
  prop items: List<Any>
  prop emptyText: Optional<String>
  prop spacing: Optional<String> = "0px"
  prop layout: Optional<String> = "column"
  prop wrap: Optional<Bool> = false
  prop keyExtractor: Optional<String>
  prop onEndReached: Optional<Event<Void>>
  prop onEndReachedThreshold: Optional<Float> = 0.5
  prop refreshing: Optional<Bool> = false
  prop onRefresh: Optional<Event<Void>>
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `data` |
| Native element | `<ul>` |
| Call property | none |
| Groups | `container` |
| Runtime defaults | `{"role":"list"}` |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `items` | `List<Any>` | — | yes |
| `emptyText` | `Optional<String>` | — | no |
| `spacing` | `Optional<String>` | `"0px"` | no |
| `layout` | `Optional<String>` | `"column"` | no |
| `wrap` | `Optional<Bool>` | `false` | no |
| `keyExtractor` | `Optional<String>` | — | no |
| `onEndReachedThreshold` | `Optional<Float>` | `0.5` | no |
| `refreshing` | `Optional<Bool>` | `false` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `onEndReached` | `Void` |
| `onRefresh` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  List {
    items: []
  }
#end view
```

## Production guidance

- Prefer List over recreating its <ul> contract through an untyped wrapper.
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
