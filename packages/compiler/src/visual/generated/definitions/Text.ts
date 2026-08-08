/**
 * Text compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Text",
    "category": "text",
    "nativeElement": "span",
    "groups": [
      "text"
    ],
    "callProperty": "text",
    "defaults": {},
    "contractSource": "#script\n  prop text: String\n  prop size: Optional<String>\n  prop weight: Optional<String> = \"normal\"\n  prop color: Optional<String>\n  prop align: Optional<String> = \"left\"\n  prop lineHeight: Optional<String>\n  prop letterSpacing: Optional<String>\n  prop textDecoration: Optional<String>\n  prop textTransform: Optional<String>\n  prop fontFamily: Optional<String>\n  prop maxLines: Optional<Int>\n  prop truncate: Optional<Bool> = false\n  prop selectable: Optional<Bool> = true\n  prop margin: Optional<String>\n#end script\n",
    "properties": [
      {
        "name": "text",
        "type": "String",
        "required": true,
        "event": false
      },
      {
        "name": "size",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "weight",
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
        "name": "align",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "lineHeight",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "letterSpacing",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "textDecoration",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "textTransform",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "fontFamily",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "maxLines",
        "type": "Optional<Int>",
        "required": false,
        "event": false
      },
      {
        "name": "truncate",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "selectable",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "margin",
        "type": "Optional<String>",
        "required": false,
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
