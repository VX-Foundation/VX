/**
 * ErrorSummary compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "ErrorSummary",
    "category": "feedback",
    "nativeElement": "div",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop controller: Any\n  prop title: Optional<String> = \"Please correct the following errors.\"\n  prop role: Optional<String> = \"alert\"\n#end script\n",
    "properties": [
      {
        "name": "controller",
        "type": "Any",
        "required": true,
        "event": false
      },
      {
        "name": "title",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "role",
        "type": "Optional<String>",
        "required": false,
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
