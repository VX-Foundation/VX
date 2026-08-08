/**
 * Divider compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Divider",
    "category": "layout",
    "nativeElement": "hr",
    "groups": [],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop orientation: Optional<String> = \"horizontal\"\n  prop thickness: Optional<String> = \"1px\"\n  prop color: Optional<String>\n  prop margin: Optional<String>\n  prop variant: Optional<String> = \"solid\"\n#end script\n",
    "properties": [
      {
        "name": "orientation",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "thickness",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "color",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "margin",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "variant",
        "type": "Optional<String>",
        "required": false,
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
