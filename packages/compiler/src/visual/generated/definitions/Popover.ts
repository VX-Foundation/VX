/**
 * Popover compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

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
    "contractSource": "#script\n  prop open: Bool = false\n  prop class: String = \"\"\n  output onClose: Void\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "open",
        "type": "Bool",
        "required": false,
        "event": false
      },
      {
        "name": "class",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "onClose",
        "type": "Optional<Event<Void>>",
        "required": false,
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
  } as const) satisfies CompilerWidgetDefinition;
