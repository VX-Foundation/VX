/**
 * Toast compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Toast",
    "category": "feedback",
    "nativeElement": "div",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop title: String = \"\"\n  prop message: String = \"\"\n  prop variant: String = \"info\"\n  prop visible: Bool = true\n  prop class: String = \"\"\n  output onDismiss: Void\n#end script\n",
    "properties": [
      {
        "name": "title",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "message",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "variant",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "visible",
        "type": "Bool",
        "required": false,
        "event": false
      },
      {
        "name": "class",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "onDismiss",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onDismiss",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
