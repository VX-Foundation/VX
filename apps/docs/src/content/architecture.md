# Architecture

VX is a compiler-first web framework. The source language records responsibilities explicitly so the compiler can build direct dependency, data, visual, component, and rendering instructions.

## Current pipeline

```text
.vx entry
→ scanner and #script/#view parsers
→ AST with source spans
→ canonical component/package resolver
→ cycle-free ComponentProjectIR
→ component contract validation
→ reactive dependency graph
→ Visual IR
→ Data Program IR
→ client/server partition checks
→ dependency-first artifacts
→ direct runtime operations
```

Expressions use syntax-tree analysis. Strings and member names are not mistaken for variables, and action parameters or local declarations can shadow component declarations correctly.

## Visual intent

`@grid`, `@title`, and other roles are compiler metadata. They are not runtime widgets, CSS classes, or style objects.

```vx
View @grid(min: 260, gap: lg) @catalog {
  ProductCard {
    product: product
  }
}
```

The Visual IR resolves structural capabilities, semantic roles, conditions, themes, static CSS, accessibility metadata, and direct reactive visual bindings before runtime.

## Component graphs

A module with `#view` is a visual component. A module without `#view` is headless.

The component resolver validates static imports, canonical project and package boundaries, symlink escapes, cycles, graph limits, convention-discovered public modules, generated integrity records, and framework compatibility before lowering. Dependents are emitted only after their dependencies pass validation.

Nested components mount without decorative wrapper elements. Props remain parent-owned signals; outputs are closed dispatch channels; named content and public visual parts have explicit contracts; cleanup is deterministic.

## Direct updates

The runtime model is dependency-directed:

```text
state changes
→ affected derive/query/view/visual bindings are invalidated
→ direct target updates are scheduled
```

VX does not rebuild and reconcile the complete view tree for ordinary state changes.
