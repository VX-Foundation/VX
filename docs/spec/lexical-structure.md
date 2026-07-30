# Lexical Structure

## Source encoding

A VX source file MUST be valid UTF-8. A byte-order mark MAY be accepted and MUST NOT affect source offsets after normalization.

Line endings MAY be LF or CRLF. Tools MUST preserve semantic source spans across either representation.

## Regions

A visual component uses these top-level regions:

```vx
#script
  // declarations
#end script

#view
  // visual tree
#end view
```

A module without `#view` is headless. A file MUST NOT contain duplicate `#script` or `#view` regions. Unknown regions are errors.

## Comments and whitespace

Line comments begin with `//`. Whitespace separates tokens but is otherwise insignificant inside `#script`. Indentation is conventional rather than semantic.

## Identifiers

Identifiers are Unicode-aware language identifiers. Reserved keywords cannot be used as declaration names without escaping. Public package names and route parameter names MUST additionally satisfy their platform-specific portability rules.

## Literals

The language supports Boolean, integer, floating-point, string, null-like optional values, list, map, duration, and structured literals where allowed by the grammar. String interpolation uses `{{ expression }}` and is parsed as an expression, not textual substitution.

## Source stability

Formatters MUST preserve comments, string contents, public names, and diagnostic source mapping. Generated output MUST refer back to the original `.vx` spans through source maps.
