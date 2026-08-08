/**
 * Modal public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Modal",
    "category": "overlay",
    "nativeElement": "dialog",
    "groups": [
      "container",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop open: Bool = false\n  prop title: String = \"\"\n  prop closeable: Bool = true\n  prop class: String = \"\"\n\n  output onClose: Void\n  content default: optional\n\n  action close() {\n    emit(\"onClose\")\n  }\n#end script\n\n#view\n  if open {\n    View @modalBackdrop {\n      View @modalCard {\n        View @modalHeader {\n          Title(title) @modalTitle\n          if closeable {\n            Button(\"✕\") @closeButton {\n              click => close()\n            }\n          }\n        }\n        View @modalBody {\n          Content(default)\n        }\n      }\n    }\n  }\n\n  @modalBackdrop {\n    flow: vertical\n    items: center\n    content: center\n    surface: rock-950\n    inset: xl\n    z: overlay\n  }\n\n  @modalCard {\n    surface: steel-900\n    border: steel-800\n    corner: xl\n    elevation: lg\n    width: dialog\n    flow: vertical\n    gap: md\n    inset: lg\n  }\n\n  @modalHeader {\n    flow: horizontal\n    content: space-between\n    items: center\n  }\n\n  @modalTitle {\n    tone: cloud-50\n  }\n\n  @closeButton {\n    surface: transparent\n    tone: cloud-400\n    when hover {\n      tone: cloud-50\n      surface: steel-800\n    }\n  }\n\n  @modalBody {\n    flow: vertical\n    gap: md\n    tone: cloud-200\n  }\n#end view\n",
    "contractSource": "#script\n  prop open: Bool = false\n  prop title: String = \"\"\n  prop closeable: Bool = true\n  prop class: String = \"\"\n  output onClose: Void\n  content default: optional\n#end script\n",
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
        "name": "closeable",
        "type": "Bool",
        "required": false,
        "defaultValue": "true",
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
