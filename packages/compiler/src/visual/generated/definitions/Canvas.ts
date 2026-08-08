/**
 * Canvas compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Canvas",
    "category": "media",
    "nativeElement": "canvas",
    "groups": [
      "media"
    ],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop width: String\n  prop height: String\n  prop contextType: Optional<String> = \"2d\"\n  prop ready: Optional<Event<Any>>\n  prop click: Optional<Event<Any>>\n#end script\n",
    "properties": [
      {
        "name": "width",
        "type": "String",
        "required": true,
        "event": false
      },
      {
        "name": "height",
        "type": "String",
        "required": true,
        "event": false
      },
      {
        "name": "contextType",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "ready",
        "type": "Optional<Event<Any>>",
        "required": false,
        "event": true
      },
      {
        "name": "click",
        "type": "Optional<Event<Any>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "ready",
        "payloadType": "Any"
      },
      {
        "name": "click",
        "payloadType": "Any"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
