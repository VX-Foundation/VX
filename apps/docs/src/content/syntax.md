# Syntax Guide

The current implemented language uses:

```text
#script
#view
```

Inside `#script`, VX recognizes:

```text
import, export, prop, output, content, part,
const, state, derive, query, action, effect, store
```

Inside `#view`, VX uses its widget-tree language, component uses, named content providers, public-part bindings, control flow, and local visual roles.

```vx
#view
  View @page {
    Card {
      title: label
      select => receive($event)
      part title @title

      content footer {
        Text("Footer")
      }
    }
  }

  @page {
    flow: vertical
    space: lg
  }
#end view
```

`#data`, `#state`, `#logic`, HTML/JSX templates, and `#style` are superseded.

The normative documents are in the repository root under `docs/`, especially `spec/README.md`, `spec/reactive-execution.md`, `spec/components.md`, and `spec/view-language.md`.
