/**
 * Icon public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Icon",
    "category": "display",
    "nativeElement": "span",
    "groups": [
      "media"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop name: String\n  prop size: Optional<String> = \"24px\"\n  prop color: Optional<String> = \"currentColor\"\n  prop decorative: Optional<Bool> = true\n  prop weight: Optional<String>\n  prop variant: Optional<String> = \"outline\"\n  prop strokeWidth: Optional<Float>\n  prop viewBox: Optional<String>\n\n  prop click: Optional<Event<Void>>\n#end script\n",
    "contractSource": "#script\n  prop name: String\n  prop size: Optional<String> = \"24px\"\n  prop color: Optional<String> = \"currentColor\"\n  prop decorative: Optional<Bool> = true\n  prop weight: Optional<String>\n  prop variant: Optional<String> = \"outline\"\n  prop strokeWidth: Optional<Float>\n  prop viewBox: Optional<String>\n  prop click: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "name",
        "type": "String",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "size",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"24px\"",
        "event": false
      },
      {
        "name": "color",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"currentColor\"",
        "event": false
      },
      {
        "name": "decorative",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "true",
        "event": false
      },
      {
        "name": "weight",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "variant",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"outline\"",
        "event": false
      },
      {
        "name": "strokeWidth",
        "type": "Optional<Float>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "viewBox",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "click",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      }
    ],
    "events": [
      {
        "name": "click",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
