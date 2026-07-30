# Continuous fuzzing

Parser, serializer, and HTTP campaigns run on pull requests with bounded iterations and on a scheduled workflow with larger corpora. Every campaign is deterministic from its seed.

A crash artifact contains the seed, iteration, original input, minimized input, stack, package versions, commit, and platform. New corpus entries are reviewed before being committed. Corpus files must be small, non-secret, non-copyrighted test inputs.

Parser fuzzing covers token boundaries, nesting, interpolation, malformed UTF-8 replacement text, directives, visual roles, route declarations, and component contracts. Serializer fuzzing covers supported values, malformed envelopes, depth and node limits, forbidden keys, and script-breaking text. HTTP fuzzing covers methods, headers, content types, content lengths, multipart boundaries, URL encoding, JSON nesting, and cancellation.
