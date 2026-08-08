/**
 * View public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "View",
    "category": "layout",
    "nativeElement": "div",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop layout: Optional<String> = \"column\"\n  prop align: Optional<String> = \"stretch\"\n  prop justify: Optional<String> = \"start\"\n  prop spacing: Optional<Int> = 0\n  prop wrap: Optional<Bool> = false\n  prop width: Optional<String>\n  prop height: Optional<String>\n  prop minWidth: Optional<String>\n  prop minHeight: Optional<String>\n  prop maxWidth: Optional<String>\n  prop maxHeight: Optional<String>\n  prop padding: Optional<String>\n  prop margin: Optional<String>\n  prop background: Optional<String>\n  prop cornerRadius: Optional<String>\n  prop border: Optional<String>\n  prop shadow: Optional<String>\n  prop opacity: Optional<Float>\n  prop overflow: Optional<String>\n  prop position: Optional<String>\n  prop zIndex: Optional<Int>\n  prop cursor: Optional<String>\n\n  prop click: Optional<Event<Void>>\n  prop mouseEnter: Optional<Event<Void>>\n  prop mouseLeave: Optional<Event<Void>>\n#end script\n",
    "contractSource": "#script\n  prop layout: Optional<String> = \"column\"\n  prop align: Optional<String> = \"stretch\"\n  prop justify: Optional<String> = \"start\"\n  prop spacing: Optional<Int> = 0\n  prop wrap: Optional<Bool> = false\n  prop width: Optional<String>\n  prop height: Optional<String>\n  prop minWidth: Optional<String>\n  prop minHeight: Optional<String>\n  prop maxWidth: Optional<String>\n  prop maxHeight: Optional<String>\n  prop padding: Optional<String>\n  prop margin: Optional<String>\n  prop background: Optional<String>\n  prop cornerRadius: Optional<String>\n  prop border: Optional<String>\n  prop shadow: Optional<String>\n  prop opacity: Optional<Float>\n  prop overflow: Optional<String>\n  prop position: Optional<String>\n  prop zIndex: Optional<Int>\n  prop cursor: Optional<String>\n  prop click: Optional<Event<Void>>\n  prop mouseEnter: Optional<Event<Void>>\n  prop mouseLeave: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "layout",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"column\"",
        "event": false
      },
      {
        "name": "align",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"stretch\"",
        "event": false
      },
      {
        "name": "justify",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"start\"",
        "event": false
      },
      {
        "name": "spacing",
        "type": "Optional<Int>",
        "required": false,
        "defaultValue": "0",
        "event": false
      },
      {
        "name": "wrap",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "width",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "height",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "minWidth",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "minHeight",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "maxWidth",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "maxHeight",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "padding",
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
        "name": "background",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "cornerRadius",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "border",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "shadow",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "opacity",
        "type": "Optional<Float>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "overflow",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "position",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "zIndex",
        "type": "Optional<Int>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "cursor",
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
      },
      {
        "name": "mouseEnter",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "mouseLeave",
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
      },
      {
        "name": "mouseEnter",
        "payloadType": "Void"
      },
      {
        "name": "mouseLeave",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
