/**
 * FormError compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "FormError",
    "category": "feedback",
    "nativeElement": "div",
    "groups": [
      "text"
    ],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop controller: Any\n  prop role: Optional<String> = \"alert\"\n#end script\n",
    "properties": [
      {
        "name": "controller",
        "type": "Any",
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
