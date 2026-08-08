/**
 * List compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "List",
    "category": "data",
    "nativeElement": "ul",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {
      "role": "list"
    },
    "contractSource": "#script\n  prop items: List<Any>\n  prop emptyText: Optional<String>\n  prop spacing: Optional<String> = \"0px\"\n  prop layout: Optional<String> = \"column\"\n  prop wrap: Optional<Bool> = false\n  prop keyExtractor: Optional<String>\n  prop onEndReached: Optional<Event<Void>>\n  prop onEndReachedThreshold: Optional<Float> = 0.5\n  prop refreshing: Optional<Bool> = false\n  prop onRefresh: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "items",
        "type": "List<Any>",
        "required": true,
        "event": false
      },
      {
        "name": "emptyText",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "spacing",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "layout",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "wrap",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "keyExtractor",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "onEndReached",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "onEndReachedThreshold",
        "type": "Optional<Float>",
        "required": false,
        "event": false
      },
      {
        "name": "refreshing",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "onRefresh",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onEndReached",
        "payloadType": "Void"
      },
      {
        "name": "onRefresh",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
