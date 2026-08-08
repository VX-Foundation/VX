/**
 * Audio public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Audio",
    "category": "media",
    "nativeElement": "audio",
    "groups": [
      "media",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop src: String\n  prop autoPlay: Optional<Bool> = false\n  prop controls: Optional<Bool> = true\n  prop loop: Optional<Bool> = false\n  prop muted: Optional<Bool> = false\n  prop preload: Optional<String> = \"metadata\"\n\n  prop play: Optional<Event<Void>>\n  prop pause: Optional<Event<Void>>\n  prop end: Optional<Event<Void>>\n  prop timeUpdate: Optional<Event<Float>>\n#end script\n",
    "contractSource": "#script\n  prop src: String\n  prop autoPlay: Optional<Bool> = false\n  prop controls: Optional<Bool> = true\n  prop loop: Optional<Bool> = false\n  prop muted: Optional<Bool> = false\n  prop preload: Optional<String> = \"metadata\"\n  prop play: Optional<Event<Void>>\n  prop pause: Optional<Event<Void>>\n  prop end: Optional<Event<Void>>\n  prop timeUpdate: Optional<Event<Float>>\n#end script\n",
    "properties": [
      {
        "name": "src",
        "type": "String",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "autoPlay",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "controls",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "true",
        "event": false
      },
      {
        "name": "loop",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "muted",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "preload",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"metadata\"",
        "event": false
      },
      {
        "name": "play",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "pause",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "end",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "timeUpdate",
        "type": "Optional<Event<Float>>",
        "required": false,
        "defaultValue": null,
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
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
