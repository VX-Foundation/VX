/**
 * Spinner compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Spinner",
    "category": "feedback",
    "nativeElement": "span",
    "groups": [],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop size: String = \"md\"\n  prop class: String = \"\"\n#end script\n",
    "properties": [
      {
        "name": "size",
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
