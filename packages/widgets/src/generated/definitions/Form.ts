/**
 * Form public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Form",
    "category": "form",
    "nativeElement": "form",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop controller: Optional<Any>\n  prop action: Optional<String>\n  prop method: Optional<String> = \"post\"\n  prop autocomplete: Optional<String>\n  prop noValidate: Optional<Bool> = false\n\n  prop submit: Optional<Event<Any>>\n  prop reset: Optional<Event<Void>>\n#end script\n",
    "contractSource": "#script\n  prop controller: Optional<Any>\n  prop action: Optional<String>\n  prop method: Optional<String> = \"post\"\n  prop autocomplete: Optional<String>\n  prop noValidate: Optional<Bool> = false\n  prop submit: Optional<Event<Any>>\n  prop reset: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "controller",
        "type": "Optional<Any>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "action",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "method",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"post\"",
        "event": false
      },
      {
        "name": "autocomplete",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "noValidate",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "submit",
        "type": "Optional<Event<Any>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "reset",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      }
    ],
    "events": [
      {
        "name": "submit",
        "payloadType": "Any"
      },
      {
        "name": "reset",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
