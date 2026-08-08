# DATA DISPLAY

This guide groups 16 canonical widgets used for data, display, text, media, layout scenarios.

## Widgets

- [Audio](./components/Audio.md) — `<audio>`, 10 properties, 4 events.
- [Avatar](./components/Avatar.md) — `<span>`, 4 properties, 0 events.
- [Badge](./components/Badge.md) — `<span>`, 3 properties, 0 events.
- [Canvas](./components/Canvas.md) — `<canvas>`, 5 properties, 2 events.
- [DataTable](./components/DataTable.md) — `<table>`, 1 properties, 0 events.
- [Divider](./components/Divider.md) — `<hr>`, 5 properties, 0 events.
- [Icon](./components/Icon.md) — `<span>`, 9 properties, 1 events.
- [IFrame](./components/IFrame.md) — `<iframe>`, 12 properties, 2 events.
- [Image](./components/Image.md) — `<img>`, 13 properties, 2 events.
- [List](./components/List.md) — `<ul>`, 10 properties, 2 events.
- [ScrollView](./components/ScrollView.md) — `<div>`, 15 properties, 3 events.
- [Text](./components/Text.md) — `<span>`, 14 properties, 0 events.
- [Title](./components/Title.md) — `<h1>`, 3 properties, 0 events.
- [Video](./components/Video.md) — `<video>`, 17 properties, 5 events.
- [View](./components/View.md) — `<div>`, 25 properties, 3 events.
- [VirtualList](./components/VirtualList.md) — `<div>`, 2 properties, 0 events.

## Guidance

- Start from the native widget contract and compose behavior through typed state, actions, content regions, and Visual roles.
- Preserve accessible names, keyboard behavior, focus visibility, deterministic SSR output, and stable collection identity.
- Do not maintain independent property or native-element maps in application code.
