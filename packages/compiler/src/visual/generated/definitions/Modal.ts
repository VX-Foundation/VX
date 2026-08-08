/**
 * Modal compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

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
    "contractSource": "#script\n  prop open: Bool = false\n  prop title: String = \"\"\n  prop closeable: Bool = true\n  prop class: String = \"\"\n  output onClose: Void\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "open",
        "type": "Bool",
        "required": false,
        "event": false
      },
      {
        "name": "title",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "closeable",
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
