/**
 * ScrollView compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "ScrollView",
    "category": "layout",
    "nativeElement": "div",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop direction: Optional<String> = \"vertical\"\n  prop showsIndicators: Optional<Bool> = true\n  prop padding: Optional<String>\n  prop margin: Optional<String>\n  prop background: Optional<String>\n  prop width: Optional<String>\n  prop height: Optional<String>\n  prop maxHeight: Optional<String>\n  prop maxWidth: Optional<String>\n  prop contentContainerStyle: Optional<String>\n  prop scrollEventThrottle: Optional<Int> = 16\n  prop bounces: Optional<Bool> = true\n  prop scroll: Optional<Event<Any>>\n  prop scrollBeginDrag: Optional<Event<Void>>\n  prop scrollEndDrag: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "direction",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "showsIndicators",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "padding",
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
        "name": "background",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "width",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "height",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "maxHeight",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "maxWidth",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "contentContainerStyle",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "scrollEventThrottle",
        "type": "Optional<Int>",
        "required": false,
        "event": false
      },
      {
        "name": "bounces",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "scroll",
        "type": "Optional<Event<Any>>",
        "required": false,
        "event": true
      },
      {
        "name": "scrollBeginDrag",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "scrollEndDrag",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "scroll",
        "payloadType": "Any"
      },
      {
        "name": "scrollBeginDrag",
        "payloadType": "Void"
      },
      {
        "name": "scrollEndDrag",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
