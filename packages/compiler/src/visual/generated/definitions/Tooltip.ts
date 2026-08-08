/**
 * Tooltip compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Tooltip",
    "category": "feedback",
    "nativeElement": "span",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop contentText: String = \"\"\n  prop position: String = \"top\"\n  prop class: String = \"\"\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "contentText",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "position",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "class",
        "type": "String",
        "required": false,
        "event": false
      }
    ],
    "events": [],
    "content": [
      {
        "name": "default",
        "cardinality": "optional",
        "required": false
      }
    ]
  } as const) satisfies CompilerWidgetDefinition;
