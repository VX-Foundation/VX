/**
 * List public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

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
    "source": "#script\n  prop items: List<Any>\n  prop emptyText: Optional<String>\n  prop spacing: Optional<String> = \"0px\"\n  prop layout: Optional<String> = \"column\"\n  prop wrap: Optional<Bool> = false\n  prop keyExtractor: Optional<String>\n  prop onEndReached: Optional<Event<Void>>\n  prop onEndReachedThreshold: Optional<Float> = 0.5\n  prop refreshing: Optional<Bool> = false\n  prop onRefresh: Optional<Event<Void>>\n#end script\n",
    "contractSource": "#script\n  prop items: List<Any>\n  prop emptyText: Optional<String>\n  prop spacing: Optional<String> = \"0px\"\n  prop layout: Optional<String> = \"column\"\n  prop wrap: Optional<Bool> = false\n  prop keyExtractor: Optional<String>\n  prop onEndReached: Optional<Event<Void>>\n  prop onEndReachedThreshold: Optional<Float> = 0.5\n  prop refreshing: Optional<Bool> = false\n  prop onRefresh: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "items",
        "type": "List<Any>",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "emptyText",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "spacing",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"0px\"",
        "event": false
      },
      {
        "name": "layout",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"column\"",
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
        "name": "keyExtractor",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "onEndReached",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "onEndReachedThreshold",
        "type": "Optional<Float>",
        "required": false,
        "defaultValue": "0.5",
        "event": false
      },
      {
        "name": "refreshing",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "onRefresh",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
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
  } as const) satisfies WidgetDefinition;
