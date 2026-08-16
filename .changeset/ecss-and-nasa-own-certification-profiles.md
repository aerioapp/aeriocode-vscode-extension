---
"Aerio-Code": minor
---

Give ECSS and NASA certification profiles of their own, built from their own documents.

Both regimes had a profile, and in the part that decides how a programme classifies its requirements
the two were the same thing — as DO-178C. All three profiles carried
`["system", "high_level", "low_level", "derived"]`, which is DO-178C's vocabulary, and it was the
quietest way for three regimes to be one: every visible difference was already correct, so nothing
looked wrong.

**ECSS** now uses the layers ECSS-E-ST-40C Rev.1 states — the requirements baseline and the technical
specification, which clauses 5.6.4 and 5.6.3 validate separately. `derived` is gone rather than
translated: the phrase does not appear once in that standard. It is a DO-178C concept carrying a
specific obligation, and offering it would have invited a supplier to fill a bucket their standard
asks nothing of.

**NASA** now uses the associations SWE-052's Table 1 requires traced bi-directionally: higher-level
requirements, software requirements, design components — and **system hazards**, which neither other
regime has anywhere to put. DO-178C routes that concern through the system safety assessment instead,
so a profile reusing its levels could not record it at all.

Both regimes also gain a status view of their own shape, served from the backend beside the DO-178C
Annex A dashboard:

- **ECSS** reports Annex R expected-output applicability per criticality category, from Table R-1's
  303 rows. 256 of them are applicable unchanged at all four categories — Annex R tailors what a
  deliverable must contain far more than whether it is owed, which is the opposite of Annex A, where
  the objective list itself shrinks from 71 to 26. The 18 `Ytba` rows are reported as their own
  state, neither owed nor excused: their content is to be agreed with the customer.
- **NASA** reports SWE requirement applicability per software classification, from Appendix C's 100
  rows. SWE-219 and SWE-220 are reported as *conditional* rather than applicable, because their text
  gates on the safety-critical determination the matrix does not record — a class A project whose
  software is not safety-critical owes neither.

The two tables are committed as source files with the totals their publishers state, and both fail
the build if the totals stop matching. Every clause and SWE identifier the product names is asserted
to exist in the table it claims to come from — a guard added because the first draft of the ECSS
contribution map was written from the section numbering rather than from Table R-1 and had five of
its seven keys wrong. Nothing would have failed: an unknown identifier never matches, so those
clauses would have reported "no evidence recorded" forever, on the dashboard whose only job is to say
what evidence exists.

Neither dashboard ever reports anything as satisfied, for the same reason the DO-178C one does not:
that determination belongs to the supplier, the customer, the project manager and the technical
authority, not to this tool.

Both views are in the panel, under the active certification profile — two tables chosen by regime
rather than one fed by a regime-agnostic call, for the reason the responses are separate messages. A
shared `{id, applicable}` row would have rendered a Ytba expected output and a conditional SWE
requirement as plain "applicable", which is a different claim about what the programme owes. A
DO-178C profile is not sent through either: Annex A is an objective grid carrying independence marks,
a third shape again, and it keeps its own view.

The level picker asks what a different category or class would look like without changing the one the
project is activated at, and says so on screen when the two differ. Each row also shows the standard's
own force — required, to be agreed, not applicable — wherever it says something the status does not,
so a reader can tell "ECSS does not ask this of you" from "you have not done it".

Two things the three dashboards should never have differed on are now shared. They named the same
state with different words — DO-178C reported `partial-evidence` and `out-of-scope-for-aerio` where
the other two reported `partial` and `out-of-scope` — which nothing caught because nothing compared
them, until a webview keyed its presentation on the status string and knew one dialect. And the guard
that checks every clause identifier a dashboard claims against the table it claims to come from
existed in the two new modules and not in the oldest one, which carries the most claims. Both now live
in one place that all three read.

The reported figures also add up. At ECSS categories C and D they did not: the Ytba count was taken
from the standard's own tailoring while the other four were taken from each row's status, so the one
expected output that is both marked Ytba and something Aerio holds evidence toward — the code itself
— sat in two buckets, and the five numbers on screen summed to one more than the applicable total.
Ytba now outranks evidence, which is what the standard's own reading asks: a deliverable whose extent
the parties have not agreed is not something to report progress against. What Aerio holds is still
named on the row.

