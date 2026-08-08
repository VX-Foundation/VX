/**
 * Avatar compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Avatar",
    "category": "display",
    "nativeElement": "span",
    "groups": [
      "text"
    ],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop name: String = \"User\"\n  prop src: String = \"\"\n  prop size: String = \"md\"\n  prop class: String = \"\"\n#end script\n",
    "properties": [
      {
        "name": "name",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "src",
        "type": "String",
        "required": false,
        "event": false
      },
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
