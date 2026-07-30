# Components

A component contract consists of props, models, outputs, content regions, visual parts, contexts, references, and lifecycle behavior.

## Props

Props are typed and parent-owned. A child MUST NOT mutate a prop. Models require an explicit bidirectional contract.

## Outputs

Outputs are closed event channels. A component may emit only declared outputs and payloads must match the declared event type.

## Content

Content projection is named and contract-based. A required content region must be provided. Projected content retains the lexical ownership of the parent while mounting inside the child region.

## Visual parts

Public parts are explicit customization boundaries. Consumers cannot reach private internal nodes through part overrides.

## Lifecycle

Creation, mount, update, and dispose have deterministic ordering. Cleanup continues even when another cleanup reports an error. Lazy and dynamic components preserve the same contract after resolution.

## DOM output

Components do not require decorative wrapper elements. The compiler emits the minimum direct DOM operations necessary for the declared view.
