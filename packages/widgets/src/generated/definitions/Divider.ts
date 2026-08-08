/**
 * Divider public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Divider",
    "category": "layout",
    "nativeElement": "hr",
    "groups": [],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop orientation: Optional<String> = \"horizontal\"\n  prop thickness: Optional<String> = \"1px\"\n  prop color: Optional<String>\n  prop margin: Optional<String>\n  prop variant: Optional<String> = \"solid\"\n#end script\n",
    "contractSource": "#script\n  prop orientation: Optional<String> = \"horizontal\"\n  prop thickness: Optional<String> = \"1px\"\n  prop color: Optional<String>\n  prop margin: Optional<String>\n  prop variant: Optional<String> = \"solid\"\n#end script\n",
    "properties": [
      {
        "name": "orientation",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"horizontal\"",
        "event": false
      },
      {
        "name": "thickness",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"1px\"",
        "event": false
      },
      {
        "name": "color",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "margin",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "variant",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"solid\"",
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies WidgetDefinition;
