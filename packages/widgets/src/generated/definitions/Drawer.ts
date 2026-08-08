/**
 * Drawer public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Drawer",
    "category": "overlay",
    "nativeElement": "aside",
    "groups": [
      "container",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop open: Bool = false\n  prop title: String = \"\"\n  prop side: String = \"right\"\n  prop class: String = \"\"\n\n  output onClose: Void\n  content default: optional\n\n  action close() {\n    emit(\"onClose\")\n  }\n#end script\n\n#view\n  if open {\n    View @drawerOverlay {\n      View @drawerPanel {\n        View @drawerHeader {\n          Title(title) @drawerTitle\n          Button(\"✕\") @closeBtn {\n            click => close()\n          }\n        }\n        View @drawerBody {\n          Content(default)\n        }\n      }\n    }\n  }\n\n  @drawerOverlay {\n    flow: horizontal\n    content: end\n    surface: rock-950\n    z: modal\n  }\n\n  @drawerPanel {\n    flow: vertical\n    gap: md\n    inset: xl\n    surface: steel-900\n    border: steel-800\n    height: fill\n    width: dialog\n    elevation: lg\n  }\n\n  @drawerHeader {\n    flow: horizontal\n    content: space-between\n    items: center\n  }\n\n  @drawerTitle {\n    tone: cloud-50\n  }\n\n  @closeBtn {\n    surface: transparent\n    tone: cloud-400\n    when hover {\n      tone: cloud-50\n    }\n  }\n\n  @drawerBody {\n    flow: vertical\n    gap: md\n    tone: cloud-200\n  }\n#end view\n",
    "contractSource": "#script\n  prop open: Bool = false\n  prop title: String = \"\"\n  prop side: String = \"right\"\n  prop class: String = \"\"\n  output onClose: Void\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "open",
        "type": "Bool",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "title",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "side",
        "type": "String",
        "required": false,
        "defaultValue": "\"right\"",
        "event": false
      },
      {
        "name": "class",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "onClose",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onClose",
        "payloadType": "Void"
      }
    ],
    "content": [
      {
        "name": "default",
        "cardinality": "optional",
        "required": false
      }
    ]
  } as const) satisfies WidgetDefinition;
