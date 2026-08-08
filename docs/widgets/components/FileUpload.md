# FileUpload

FileUpload is a control widget lowered to `<input>` in client and SSR output.

## Canonical contract

```vx
#script
  prop accept: String = "*/*"
  prop label: String = "Drag and drop files here, or click to browse"
  prop class: String = ""
  output onSelect: Void
#end script
```

## Metadata

| Field | Value |
|---|---|
| Category | `control` |
| Native element | `<input>` |
| Call property | none |
| Groups | `control`, `formControl`, `interactive` |
| Runtime defaults | `{"type":"file"}` |

## Properties

| Name | Type | Default | Required |
|---|---|---|---|
| `accept` | `String` | `"*/*"` | no |
| `label` | `String` | `"Drag and drop files here, or click to browse"` | no |
| `class` | `String` | `""` | no |

## Events and outputs

| Name | Payload |
|---|---|
| `onSelect` | `Void` |

## Content regions

| Name | Cardinality | Required |
|---|---|---|
| — | — | — |

## Usage shape

```text
#view
  FileUpload
#end view
```

## Production guidance

- Prefer FileUpload over recreating its <input> contract through an untyped wrapper.
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
