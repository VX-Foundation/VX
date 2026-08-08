/**
 * Badge compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Badge",
    "category": "display",
    "nativeElement": "span",
    "groups": [
      "text"
    ],
    "callProperty": "label",
    "defaults": {},
    "contractSource": "#script\n  prop label: String = \"\"\n  prop variant: String = \"default\"\n  prop class: String = \"\"\n#end script\n",
    "properties": [
      {
        "name": "label",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "variant",
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
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
