/**
 * Link public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Link",
    "category": "navigation",
    "nativeElement": "a",
    "groups": [
      "text",
      "interactive"
    ],
    "callProperty": "text",
    "defaults": {},
    "source": "#script\n  prop href: String\n  prop text: Optional<String>\n  prop target: Optional<String> = \"_self\"\n  prop rel: Optional<String>\n  prop color: Optional<String>\n  prop underline: Optional<String> = \"hover\"\n  prop size: Optional<String>\n  prop weight: Optional<String>\n\n  prop click: Optional<Event<Void>>\n#end script\n",
    "contractSource": "#script\n  prop href: String\n  prop text: Optional<String>\n  prop target: Optional<String> = \"_self\"\n  prop rel: Optional<String>\n  prop color: Optional<String>\n  prop underline: Optional<String> = \"hover\"\n  prop size: Optional<String>\n  prop weight: Optional<String>\n  prop click: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "href",
        "type": "String",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "text",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "target",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"_self\"",
        "event": false
      },
      {
        "name": "rel",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
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
        "name": "underline",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"hover\"",
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
