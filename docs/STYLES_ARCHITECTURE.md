# VX Framework: Dual-Mode Visual CSS Architecture

The VX Framework provides a dual-mode styling architecture that balances extreme native performance with flexible web ecosystem integration.

---

## 🏛️ Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       VX DUAL-MODE STYLING PIPELINE                         │
├─────────────────────────────────────────────┬───────────────────────────────┤
│ 1. DEFAULT MODE: Compiler-Scoped            │ 2. OPT-IN MODE: Static CSS    │
│    - mode: "compiler" (DEFAULT)             │    - mode: "static"           │
│    - Maximum Direct DOM performance         │    - Activated via vx.config.ts │
│    - Zero HTTP requests for .css files      │    - Extracts static .css     │
│    - Compiler-owned visual lowering         │    - Custom CSS & Frameworks  │
└─────────────────────────────────────────────┴───────────────────────────────┘
```

---

## 1. Default Mode: Native VX Compiler Performance (`mode: "compiler"`)

### How It Works
- **Enabled by Default**: Requires no additional configuration in `vx.config.ts`.
- **Zero Static Stylesheets**: Visual role declarations (`@role`) in `.vx` files are compiled directly into lowering targets for the Direct DOM Reactive Engine.
- **No Extra HTTP Requests**: The bundler **does not generate** extra static `.css` asset files for visual roles.

### Key Benefits
- **Zero FOUC (Flash of Unstyled Content)**: Styles are immediately applied upon DOM node creation.
- **Extraordinary Performance**: Surgical node-level DOM updates without CSS tree comparison or diffing overhead.
- **Instant Load Times**: Reduced network payload and immediate browser rendering.

---

## 2. Opt-In Static Mode (`mode: "static"`)

### How It Works
- **Explicitly Activated in `vx.config.ts`**:
```ts
import { defineConfig } from '@vx-foundation/core';

export default defineConfig({
  styles: {
    mode: 'static',
    files: ['src/styles/custom.css']
  }
});
```
- **Build-Time Extraction**: During compilation and `vx build`, the visual compiler extracts all visual role declarations (`@role`) into static physical `.css` bundle files (`dist/assets/vx-[hash].css`).
- **Static Asset Serving**: The SSR server injects the static stylesheet via a `<link rel="stylesheet">` tag in the initial HTML document.

### Key Benefits
- **Ecosystem Integration**: Allows importing custom `.css` files or third-party frameworks (Bootstrap, Tailwind v4, global utility classes).
- **Fine-Grained `class:` Overriding**: Allows passing `class: "..."` attributes on widgets to selectively override target visual properties (e.g. background color or shadow) while preserving non-conflicting default widget styles (padding, corners, cursor, transition).

---

## 🎯 Style Cascading Specification

When a component or widget uses default styles, visual roles, and explicit `class:` attributes:

```text
Cascade Priority:
1. Component Default Styles  (Default properties on Button/View/Text)
       ▼
2. Visual Roles (@role)       (Declared in .vx files via @btnPrimary)
       ▼
3. Explicit class: ""         (Targeted attribute overrides)
```

### Practical Example:
```vx
Button("Delete Account") @dangerButton {
  class: "bg-red-600 shadow-xl"
}
```
- **Result**: The background color and shadow are overridden by `bg-red-600 shadow-xl`, while default button padding, rounded corners, cursor, and micro-animations remain **100% intact**.
