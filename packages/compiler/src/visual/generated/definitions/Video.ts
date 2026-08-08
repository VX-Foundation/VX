/**
 * Video compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Video",
    "category": "media",
    "nativeElement": "video",
    "groups": [
      "media",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop src: String\n  prop poster: Optional<String>\n  prop autoPlay: Optional<Bool> = false\n  prop controls: Optional<Bool> = true\n  prop loop: Optional<Bool> = false\n  prop muted: Optional<Bool> = false\n  prop playsInline: Optional<Bool> = true\n  prop preload: Optional<String> = \"metadata\"\n  prop width: Optional<String>\n  prop height: Optional<String>\n  prop objectFit: Optional<String> = \"cover\"\n  prop cornerRadius: Optional<String>\n  prop play: Optional<Event<Void>>\n  prop pause: Optional<Event<Void>>\n  prop end: Optional<Event<Void>>\n  prop timeUpdate: Optional<Event<Float>>\n  prop error: Optional<Event<String>>\n#end script\n",
    "properties": [
      {
        "name": "src",
        "type": "String",
        "required": true,
        "event": false
      },
      {
        "name": "poster",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "autoPlay",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "controls",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "loop",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "muted",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "playsInline",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "preload",
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
        "name": "objectFit",
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
        "name": "play",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "pause",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "end",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "timeUpdate",
        "type": "Optional<Event<Float>>",
        "required": false,
        "event": true
      },
      {
        "name": "error",
        "type": "Optional<Event<String>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "play",
        "payloadType": "Void"
      },
      {
        "name": "pause",
        "payloadType": "Void"
      },
      {
        "name": "end",
        "payloadType": "Void"
      },
      {
        "name": "timeUpdate",
        "payloadType": "Float"
      },
      {
        "name": "error",
        "payloadType": "String"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
