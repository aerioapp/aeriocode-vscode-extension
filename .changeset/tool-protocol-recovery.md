---
"Aerio-Code": patch
---

Recover tool calls the model gets slightly wrong, instead of reporting them as nothing.

Four ways a well-formed intention was being lost, all observed from live sessions rather than
review. A call closed with another tool's tag — `<write_to_file>…</content></read_file>` — stayed
unterminated and was discarded, and the model was told its response had been cut off; since it had
in fact closed the call, it resent the identical response twice before recovering by chance. A call
under an invented name like `<writing_to_file>` was answered with "you did not use a tool", which is
false and leaves nothing to correct. A parameter closed with `</parameter>`, the JSON convention's
closer, let one parameter swallow the rest of the call. And a call made entirely in JSON
function-call dialect read as prose.

Each is now recognised and either recovered or named precisely, with the correct call shape shown.
Both parsers are covered: the close-tag handling was duplicated between them, so fixing one would
have left the defect live for half the models.
