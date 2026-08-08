# VX Framework: Native Industrial Color Palette System

The VX Framework provides a built-in, industrial-grade color palette system (`VX_COLOR_PALETTES`) with curated 50-950 shade scales and semantic design tokens for rapid, accessible, and high-performance UI styling.

---

## 🎨 Color Families Overview

### 1. Grayscale & Neutral Palettes (Shades 50–950)
- **`cloud`**: Cool, crisp slate-tinted gray (`#fafcfd` to `#070912`).
- **`smoke`**: Balanced, neutral gray (`#fbfbfc` to `#090c11`).
- **`steel`**: Industrial metallic steel (`#fcfcfc` to `#0b0c0f`).
- **`charcoal`**: Warm graphite charcoal (`#fbfbf9` to `#0e0c0a`).
- **`rock`**: Deep earthy stone (`#fbfaf8` to `#0f0d0a`).

### 2. Vibrant & Semantic Palettes (Shades 50–950)
- **Reds & Pinks**: `cherry`, `ruby`, `rose`, `blossom`
- **Oranges & Yellows**: `coral`, `sunset`, `lemon`
- **Greens & Teals**: `mint`, `forest`, `emerald`, `turquoise`
- **Blues & Purples**: `sky`, `ocean`, `sapphire`, `lavender`, `plum`, `violet`

### 3. Special Colors
- `white` (`#ffffff`), `black` (`#000000`), `transparent`, `current` (`currentColor`).

---

## 💻 Usage in `.vx` Single-File Components

Native color tokens can be referenced directly by name and shade in visual roles (`@role`):

```vx
#view
  Button("Confirm Action") @primaryButton
  View @card {
    Text("Server Active") @statusBadge
  }

  @primaryButton {
    surface: cherry-600
    tone: cloud-50
    corner: md
    when hover {
      surface: cherry-500
    }
  }

  @card {
    surface: steel-900
    border: steel-800
    tone: cloud-100
    inset: xl
  }

  @statusBadge {
    surface: emerald-100
    tone: emerald-900
    inset: badge
    corner: pill
  }
#end view
```

---

## 🛠️ Color Token Resolution

When the VX Visual Compiler compiles properties like `surface`, `color`, `border`, or `gradient`:

1. **Named Token Match**: `cherry-600` is compiled directly into `#e22631`.
2. **Shade Fallback**: If no shade is specified (e.g. `surface: sapphire`), shade `500` (`#3c82f7`) is applied by default.
3. **Hex & CSS Value Fallback**: Arbitrary Hex (`#2563eb`), RGB/HSL, and CSS `var(--...)` custom properties remain fully supported.
