# VX Framework: Multi-Framework Interop Architecture

The VX Framework provides native multi-framework component interoperability, allowing existing TypeScript JSX/TSX, Vue, and Svelte components to be imported directly into `.vx` files and rendered as Integration Islands.

---

## 🏛️ Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       VX MULTI-FRAMEWORK RENDER TREE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Core Application (.vx) ➔ Direct DOM Lowering (0ms overhead)              │
│    ├── View @header                                                         │
│    ├── Title("Dashboard")                                                   │
│    │                                                                        │
│    └── 🛑 INTEGRATION ISLAND BOUNDARY (Signal-to-Props Bridge)              │
│         ├── TSX Component   (React / Preact / Solid)                        │
│         ├── Vue Component   (Single File Component .vue)                    │
│         └── Svelte Component (Svelte .svelte)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Supported Component Extensions

The VX script parser (`#script`) and module resolver recognize and validate the following component extensions:

- **`.vx`**: Native VX Compiler-First components (Direct DOM lowering).
- **`.tsx` / `.jsx`**: React, Preact, or Solid TSX/JSX component trees.
- **`.vue`**: Vue 3 Single File Components.
- **`.svelte`**: Svelte components.

---

## Usage Example in `.vx` Files

Import external framework components in the `#script` block and invoke them as widgets in the `#view` block:

```vx
#script
  import { UserAvatar } from "../components/UserAvatar.tsx"
  import MetricChart from "../components/MetricChart.vue"
  import BadgeCounter from "../components/BadgeCounter.svelte"

  state activeUser: String = "Alex"
  state metricValue: Int = 85
  state notifications: Int = 3
#end script

#view
  View @dashboard {
    View @interopHeader {
      UserAvatar {
        name: activeUser
        size: "lg"
      }
      BadgeCounter {
        count: notifications
      }
    }

    View @interopContent {
      MetricChart {
        title: "Server Efficiency"
        value: metricValue
      }
    }
  }

  @dashboard {
    flow: vertical
    gap: lg
    inset: xl
    surface: raised
  }

  @interopHeader {
    flow: horizontal
    items: center
    content: between
    gap: md
  }

  @interopContent {
    flow: vertical
    gap: lg
  }
#end view
```

---

## Styling Rules per Execution Mode

Multi-framework components strictly adhere to the project's styling mode configured in `vx.config.ts`:

### 1. Default Mode (`mode: "compiler"`)
- **Zero Static CSS**: The `.vx` application layer emits 0% static CSS files, preserving native Direct DOM performance.
- External framework components operate as functional integration islands without injecting unmanaged global styles.

### 2. Static Opt-In Mode (`mode: "static"`)
- Activated explicitly in `vx.config.ts`:
  ```ts
  import { defineConfig } from '@vx-foundation/core';

  export default defineConfig({
    styles: {
      mode: 'static'
    }
  });
  ```
- Scoped styles from Vue (`<style scoped>`), Svelte (`<style>`), and TSX CSS imports are consolidated into the build output CSS bundle (`dist/assets/vx-[hash].css`).
