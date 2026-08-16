---
"Aerio-Code": patch
---

Make deviations reachable from the violation, instead of only from the command palette.

Raising and reviewing a deviation shipped as palette commands with no button, no menu entry and no
code action anywhere. Everything worked, and nobody could find it: the palette is where you go for
something you already know the name of, and a programme staring at a mandatory finding it cannot
clear had no way to learn that deviations exist.

⚠️ The gap was invisible from inside the code because the feature is complete and tested. It showed
up the first time somebody was asked to use it and answered "I don't have such option in extension".

**Raising is now a lightbulb action on the finding.** The cursor is already on the violation, the
squiggle is under it, and "Fix with Aeriocode" is in the same menu — *fix it* and *I cannot fix it*
are the two honest answers to a finding and belong next to each other. The action carries the
finding with it, so the flow opens on the scope question rather than asking which violation you
meant when you have just pointed at one. The palette route still asks, and is what you use to
re-raise a settled record.

Offered only on **mandatory** findings, matching the command's own filter. An advisory does not fail
a gate, so a record against one would mean nothing — and offering it would teach that deviations are
how advisories get silenced. A finding an approved deviation already covers falls out of the same
test, because applying one clears `mandatory`.

**Reviewing stays a separate command, and gets no button.** It is a list operation with no cursor
position, so a code action is the wrong shape for it. More to the point, a "Review deviations" button
shown right after somebody writes a rationale puts them one click from the screen that approves it,
which is the adjacency the two commands are kept apart to avoid. The message after raising now names
the command instead — findable without being invited.

Two defects found while testing this, both in the `vscode` test mock rather than in shipped code:
`Range` accepted only `(Position, Position)` while the real API also takes four numbers, so any test
of a diagnostic built the numeric way got a Range whose `start` was a number and whose `start.line`
was `undefined` — comparisons of undefined to undefined that passed. And `CodeAction` /
`CodeActionKind` were absent entirely, so no code action provider could be unit tested at all.
