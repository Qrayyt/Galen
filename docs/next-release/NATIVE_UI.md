# Galen native UI v1

Use ordinary Markdown plus optional fenced `galen-ui` blocks. A block is strict JSON with version=1, a plain-text fallback, and 1–12 flat blocks. The client limits input to 64,000 characters. Native types: card, table, progress, checklist, diagram, calculator, input, chart. See galenUiSpec.ts for field limits. Strings render as text, not HTML. Fixed arithmetic has no expression evaluator; interactions only modify the local component or copy a value after a click. No model-defined event handler, network call, shell, tool action, script, or URL is accepted.

An open final fence displays a pending state, and invalid closed JSON remains readable as source. Essential prose must precede the block. Existing chat HTML previews are inert; chat cannot opt in to executing scripts. Other explicitly opened legacy artifact surfaces retain their existing separate behavior.

Current limitations: native control state is ephemeral pending message-scoped persistence; no tool-submit action; diagram is a sequence, not arbitrary graph; rich provider streaming and desktop acceptance remain to be exercised.
