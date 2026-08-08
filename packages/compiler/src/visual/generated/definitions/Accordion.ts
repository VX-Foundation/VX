/**
 * Accordion compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Accordion",
    "category": "composite",
    "nativeElement": "details",
    "groups": [
      "container",
      "interactive"
    ],
    "callProperty": "title",
    "defaults": {},
    "contractSource": "#script\n  prop title: String = \"\"\n  prop expanded: Bool = false\n  prop class: String = \"\"\n  output onToggle: Void\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "title",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "expanded",
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
        "name": "onToggle",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onToggle",
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
