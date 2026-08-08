/**
 * Title public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Title",
    "category": "text",
    "nativeElement": "h1",
    "groups": [
      "text"
    ],
    "callProperty": "text",
    "defaults": {},
    "source": "#script\n  prop text: String\n  prop level: Optional<Int> = 1\n  prop id: Optional<String>\n#end script\n",
    "contractSource": "#script\n  prop text: String\n  prop level: Optional<Int> = 1\n  prop id: Optional<String>\n#end script\n",
    "properties": [
      {
        "name": "text",
        "type": "String",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "level",
        "type": "Optional<Int>",
        "required": false,
        "defaultValue": "1",
        "event": false
      },
      {
        "name": "id",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies WidgetDefinition;
