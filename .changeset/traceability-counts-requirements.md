---
"Aerio-Code": patch
---

Fix the traceability figure the certification status bar and the enforcement gate report.

It counted **files**, and divided them by the number of **requirements**. `getLinkCounts()` returned
`COUNT(DISTINCT artifact_path)` from the link table, and the status computation treated that as the
number of traced requirements — so a requirement linked to five source files reported 500% traced,
and a baseline where several requirements share one file reported far less than it had.

That number was not only displayed. It was passed to the coverage enforcement check as the traced
count, where the pass condition is 100%, so a programme with one requirement and a handful of linked
files was told its DO-178C traceability objective was met. The percentage and the verdict were both
wrong, in whichever direction the project's file layout happened to push them.

Both directions now come from one function over the requirement baseline — the same one the
traceability matrix reports from, so the matrix and the status bar can no longer give different
answers to the same question. A requirement counts as implemented when it has a link to source code:
a linked design document is not implementing code, which is the other half of this defect and the
reason the matrix stopped reporting a per-requirement percentage.

`getLinkCounts()` is gone rather than corrected. Every caller wanted "how many requirements have
implementing code", and leaving a plausible-looking counter behind is how the next one gets the same
wrong answer.
