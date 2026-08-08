/**
 * Text public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Text",
    "category": "text",
    "nativeElement": "span",
    "groups": [
      "text"
    ],
    "callProperty": "text",
    "defaults": {},
    "source": "#script\n  prop text: String\n  prop size: Optional<String>\n  prop weight: Optional<String> = \"normal\"\n  prop color: Optional<String>\n  prop align: Optional<String> = \"left\"\n  prop lineHeight: Optional<String>\n  prop letterSpacing: Optional<String>\n  prop textDecoration: Optional<String>\n  prop textTransform: Optional<String>\n  prop fontFamily: Optional<String>\n  prop maxLines: Optional<Int>\n  prop truncate: Optional<Bool> = false\n  prop selectable: Optional<Bool> = true\n  prop margin: Optional<String>\n#end script\n",
    "contractSource": "#script\n  prop text: String\n  prop size: Optional<String>\n  prop weight: Optional<String> = \"normal\"\n  prop color: Optional<String>\n  prop align: Optional<String> = \"left\"\n  prop lineHeight: Optional<String>\n  prop letterSpacing: Optional<String>\n  prop textDecoration: Optional<String>\n  prop textTransform: Optional<String>\n  prop fontFamily: Optional<String>\n  prop maxLines: Optional<Int>\n  prop truncate: Optional<Bool> = false\n  prop selectable: Optional<Bool> = true\n  prop margin: Optional<String>\n#end script\n",
    "properties": [
      {
        "name": "text",
        "type": "String",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "size",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "weight",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"normal\"",
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
        "name": "align",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"left\"",
        "event": false
      },
      {
        "name": "lineHeight",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "letterSpacing",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "textDecoration",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "textTransform",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "fontFamily",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "maxLines",
        "type": "Optional<Int>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "truncate",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "selectable",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "true",
        "event": false
      },
      {
        "name": "margin",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies WidgetDefinition;
