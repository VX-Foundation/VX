# @vx-foundation/widgets — Standalone UI Component Library

`@vx-foundation/widgets` is a standalone, optional UI component library for the VX Framework. It provides pre-styled, accessible, and high-performance UI primitives (`Modal`, `Toast`, `Badge`, `Avatar`, `Spinner`, `Button`, `Input`, `Select`, `Switch`, etc.) without bloating the core VX compiler.

---

## 📦 Installation (Optional)

Install `@vx-foundation/widgets` separately when pre-built UI primitives are required:

```bash
# Using npm
npm install @vx-foundation/widgets

# Using pnpm
pnpm add @vx-foundation/widgets

# Using yarn
yarn add @vx-foundation/widgets

# Using bun
bun add @vx-foundation/widgets
```

---

## 🧱 Complete Industrial Component Catalog

### Category A: Overlays & Feedbacks
- **`Modal.vx`**: Accessible dialog window with backdrop overlay, title, close action, and body content slot.
- **`Drawer.vx`**: Slide-over side panel drawer.
- **`Toast.vx`**: Floating notification alert banner for success, warning, and error messages.
- **`Tooltip.vx`**: Contextual hover tooltip bubble.
- **`Popover.vx`**: Floating popover menu container.

### Category B: Data Display & Lists
- **`DataTable.vx`**: Structured table container for tabular data displays.
- **`VirtualList.vx`**: High-performance scroll container for large datasets.
- **`Badge.vx`**: Rounded status chip badge for tags and state indicators.
- **`Avatar.vx`**: Profile avatar with fallback initials and image support.

### Category C: Navigation & Organization
- **`Tabs.vx`**: Segmented tab switcher header and panels.
- **`Breadcrumb.vx`**: Hierarchical navigation path trail.
- **`Accordion.vx`**: Collapsible disclosure card panel.

### Category D: Loading & Progress
- **`Progress.vx` / `ProgressBar.vx`**: Linear progress bar.
- **`Spinner.vx`**: Smooth circular loading spinner.
- **`Skeleton.vx`**: Pulsing content loading placeholder.

### Category E: Advanced Forms
- **`TextArea.vx`**: Multi-line text entry field.
- **`Slider.vx`**: Numeric range slider control.
- **`DatePicker.vx`**: Visual date picker input.
- **`FileUpload.vx`**: Drag and drop file upload zone.

---

## 💻 Example Usage

```vx
#script
  import { Modal, Toast, Badge, Avatar, Spinner } from "@vx-foundation/widgets"

  state isModalOpen: Bool = false
  state isToastVisible: Bool = true
#end script

#view
  View @container {
    Avatar {
      name: "Alex Developer"
    }

    Badge {
      label: "Active"
    }

    Spinner {}

    Modal {
      open: isModalOpen
      title: "Account Settings"
      onClose: isModalOpen = false
    }

    Toast {
      visible: isToastVisible
      title: "Success"
      message: "Profile updated successfully."
      onDismiss: isToastVisible = false
    }
  }
#end view
```
