/**
 * Popover public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Popover",
    "category": "overlay",
    "nativeElement": "div",
    "groups": [
      "container",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop open: Bool = false\n  prop class: String = \"\"\n\n  output onClose: Void\n  content default: optional\n#end script\n\n#view\n  View @popoverWrapper {\n    if open {\n      View @popoverPanel {\n        Content(default)\n      }\n    }\n  }\n\n  @popoverWrapper {\n    display: inline-flex\n    stack: true\n  }\n\n  @popoverPanel {\n    flow: vertical\n    inset: md\n    corner: lg\n    surface: steel-900\n    border: steel-800\n    elevation: md\n    z: overlay\n  }\n#end view\n",
    "contractSource": "#script\n  prop open: Bool = false\n  prop class: String = \"\"\n  output onClose: Void\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "open",
        "type": "Bool",
        "required": false,
        "defaultValue": "false",
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
