/**
 * IFrame public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "IFrame",
    "category": "media",
    "nativeElement": "iframe",
    "groups": [
      "media"
    ],
    "callProperty": null,
    "defaults": {
      "loading": "lazy",
      "referrerPolicy": "strict-origin-when-cross-origin",
      "sandbox": ""
    },
    "source": "#script\n  prop src: String\n  prop title: Optional<String>\n  prop width: Optional<String> = \"100%\"\n  prop height: Optional<String> = \"100%\"\n  prop loading: Optional<String> = \"lazy\"\n  prop allowFullScreen: Optional<Bool> = false\n  prop allow: Optional<String>\n  prop referrerPolicy: Optional<String>\n  prop sandbox: Optional<String>\n  prop trusted: Optional<Bool> = false\n\n  prop load: Optional<Event<Void>>\n  prop error: Optional<Event<String>>\n#end script\n",
    "contractSource": "#script\n  prop src: String\n  prop title: Optional<String>\n  prop width: Optional<String> = \"100%\"\n  prop height: Optional<String> = \"100%\"\n  prop loading: Optional<String> = \"lazy\"\n  prop allowFullScreen: Optional<Bool> = false\n  prop allow: Optional<String>\n  prop referrerPolicy: Optional<String>\n  prop sandbox: Optional<String>\n  prop trusted: Optional<Bool> = false\n  prop load: Optional<Event<Void>>\n  prop error: Optional<Event<String>>\n#end script\n",
    "properties": [
      {
        "name": "src",
        "type": "String",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "title",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "width",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"100%\"",
        "event": false
      },
      {
        "name": "height",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"100%\"",
        "event": false
      },
      {
        "name": "loading",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"lazy\"",
        "event": false
      },
      {
        "name": "allowFullScreen",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "allow",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "referrerPolicy",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "sandbox",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "trusted",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "load",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "error",
        "type": "Optional<Event<String>>",
        "required": false,
        "defaultValue": null,
        "event": true
      }
    ],
    "events": [
      {
        "name": "load",
        "payloadType": "Void"
      },
      {
        "name": "error",
        "payloadType": "String"
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
