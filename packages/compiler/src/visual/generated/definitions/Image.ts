/**
 * Image compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Image",
    "category": "media",
    "nativeElement": "img",
    "groups": [
      "media"
    ],
    "callProperty": null,
    "defaults": {
      "loading": "lazy",
      "decoding": "async"
    },
    "contractSource": "#script\n  prop src: String\n  prop alt: Optional<String> = \"\"\n  prop decorative: Optional<Bool> = false\n  prop objectFit: Optional<String> = \"cover\"\n  prop objectPosition: Optional<String> = \"center\"\n  prop width: Optional<String>\n  prop height: Optional<String>\n  prop loading: Optional<String> = \"lazy\"\n  prop crossOrigin: Optional<String>\n  prop cornerRadius: Optional<String>\n  prop fallbackSrc: Optional<String>\n  prop load: Optional<Event<Void>>\n  prop error: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "src",
        "type": "String",
        "required": true,
        "event": false
      },
      {
        "name": "alt",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "decorative",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "objectFit",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "objectPosition",
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
        "name": "loading",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "crossOrigin",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "cornerRadius",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "fallbackSrc",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "load",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "error",
        "type": "Optional<Event<Void>>",
        "required": false,
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
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
