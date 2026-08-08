/**
 * Skeleton compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Skeleton",
    "category": "feedback",
    "nativeElement": "div",
    "groups": [],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop width: String = \"fill\"\n  prop height: String = \"md\"\n  prop class: String = \"\"\n#end script\n",
    "properties": [
      {
        "name": "width",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "height",
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
