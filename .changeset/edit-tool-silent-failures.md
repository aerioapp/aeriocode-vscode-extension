---
"Aerio-Code": patch
---

Fix three ways an edit could fail without saying so.

`replace_in_file` matches SEARCH text against the file, and three shapes it should have accepted were
being rejected — two of them silently, which is worse than a rejection because a rejection can be
retried and a silent no-op cannot even be noticed.

**Indented markers matched nothing.** The marker patterns were anchored and tested against the
untrimmed line, so `    ------- SEARCH` — indented because the model is editing inside a class body
and matching the surrounding code — was not recognised as a marker at all. With no markers found the
diff parsed as containing *no blocks*, and the file came back unchanged with no error raised: the
edit reported success and nothing happened. Marker lines are now trimmed before matching, and only
the marker lines — the content between them is the file's, and trimming that would reindent the code
being written.

**A SEARCH block that dropped the file's blank lines matched nothing.** All three existing matching
strategies compare by position, so one missing blank line shifts every subsequent index and they fail
together — on a block that quoted every line of code correctly. The model was told its search "does
not match anything in the file", which is true and useless. A fourth strategy now forgives blank
lines and nothing else: every non-blank line must still match exactly once trimmed, in order, none
skipped, and it runs last so it cannot loosen a match the others would have made.

**A file whose content mentioned `<function_calls>` was destroyed.** Under the parser used by
next-gen model families, that literal string inside a `<content>` value flipped the parser out of the
tool call mid-value; the tool never closed and the write was discarded, with the model told it had
been cut off. Asking Aeriocode to write documentation about tool calling lost the document. The
function-call branch is now guarded against firing inside a tool use or a parameter value.

All three were found from recorded sessions rather than review, and each made a correct edit look
like a model failure.
