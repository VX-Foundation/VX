/**
 * ErrorSummary public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "ErrorSummary",
    "category": "feedback",
    "nativeElement": "div",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop controller: Any\n  prop title: Optional<String> = \"Please correct the following errors.\"\n  prop role: Optional<String> = \"alert\"\n#end script\n",
    "contractSource": "#script\n  prop controller: Any\n  prop title: Optional<String> = \"Please correct the following errors.\"\n  prop role: Optional<String> = \"alert\"\n#end script\n",
    "properties": [
      {
        "name": "controller",
        "type": "Any",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "title",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"Please correct the following errors.\"",
        "event": false
      },
      {
        "name": "role",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"alert\"",
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies WidgetDefinition;
