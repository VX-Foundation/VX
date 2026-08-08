/**
 * FieldError compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "FieldError",
    "category": "feedback",
    "nativeElement": "span",
    "groups": [
      "text"
    ],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop field: String\n  prop role: Optional<String> = \"alert\"\n#end script\n",
    "properties": [
      {
        "name": "field",
        "type": "String",
        "required": true,
        "event": false
      },
      {
        "name": "role",
        "type": "Optional<String>",
        "required": false,
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
