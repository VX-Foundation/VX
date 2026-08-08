/**
 * Title compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Title",
    "category": "text",
    "nativeElement": "h1",
    "groups": [
      "text"
    ],
    "callProperty": "text",
    "defaults": {},
    "contractSource": "#script\n  prop text: String\n  prop level: Optional<Int> = 1\n  prop id: Optional<String>\n#end script\n",
    "properties": [
      {
        "name": "text",
        "type": "String",
        "required": true,
        "event": false
      },
      {
        "name": "level",
        "type": "Optional<Int>",
        "required": false,
        "event": false
      },
      {
        "name": "id",
        "type": "Optional<String>",
        "required": false,
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
