/**
 * Button compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Button",
    "category": "control",
    "nativeElement": "button",
    "groups": [
      "control",
      "interactive",
      "text"
    ],
    "callProperty": "label",
    "defaults": {
      "type": "button"
    },
    "contractSource": "#script\n  prop label: Optional<String>\n  prop variant: Optional<String> = \"primary\"\n  prop size: Optional<String> = \"medium\"\n  prop disabled: Optional<Bool> = false\n  prop loading: Optional<Bool> = false\n  prop fullWidth: Optional<Bool> = false\n  prop type: Optional<String> = \"button\"\n  prop iconLeft: Optional<String>\n  prop iconRight: Optional<String>\n  prop form: Optional<String>\n  prop click: Optional<Event<Void>>\n  prop focus: Optional<Event<Void>>\n  prop blur: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "label",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "variant",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "size",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "disabled",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "loading",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "fullWidth",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "type",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "iconLeft",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "iconRight",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "form",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "click",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "focus",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "blur",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "click",
        "payloadType": "Void"
      },
      {
        "name": "focus",
        "payloadType": "Void"
      },
      {
        "name": "blur",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
