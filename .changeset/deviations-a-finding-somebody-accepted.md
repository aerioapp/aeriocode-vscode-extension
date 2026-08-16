---
"Aerio-Code": minor
---

Record a finding somebody decided to accept, instead of hiding it in a baseline.

The compliance gate already told the model that "a deviation somebody decided on is acceptable, a
silent one is not". There was nowhere to put one. A programme with mandatory findings it could not
clear had two options and both were bad: ship a red pipeline, or freeze the violations into a
baseline — which makes the build green, carries no rationale, no approver and no review date, and
hands an auditor a file that silently suppresses violations for no stated reason.

**The second is worse and it is what people do**, because a baseline is already there and it works.
Offering baselines without offering this is what made that the path of least resistance.

A deviation now carries what every regime that permits one asks for. NPR 7150.2D 3.7.5 [SWE-220]
says an exceedance is *reviewed and waived with rationale* by the project manager or technical
approval authority; ECSS handles the same situation as an RFD agreed with the customer; DO-178C
expects deviations from the declared standards to be identified in the plans and justified.

**A deviated finding is annotated, never removed.** It stays in the result with the record attached
and only its `mandatory` flag cleared, so a gate stops demanding repair while the report can still
say "these violations are present, and here is who accepted each one". A mechanism that dropped them
would produce a clean report over non-conforming code — the exact artifact an audit exists to catch.
The conformance verdict has its own outcome for this rather than a footnote on the clean one, and it
sits inside the signature.

⚠️ **The client never sends deviations.** A caller able to post them alongside its source could waive
its own findings in the same request that produces the signed report about them. The request carries
a project key; the backend reads only records that reached `approved` through a path that requires a
named authority and refuses the raiser.

Scope is narrow-to-wide — one finding, one rule in one file, or one rule project-wide — and the
widest may not be granted without a review date, because an open-ended project-wide waiver on a
mandatory rule is an undocumented amendment to the standard and the single most likely thing to be
granted once during a crunch and never looked at again. Narrow scopes may be permanent: "this
register map is hardware-defined" is a true statement that does not need revisiting quarterly, and
forcing an expiry onto it would train people to enter a far-future date, which looks like a decision
and is not one.

Independence is enforced where it can be and recorded where it cannot. An approval must name an
authority other than the raiser. Whether that person actually entered it is a different question: a
project has one owning account, so refusing a same-account approval would not make approval
independent, it would make it impossible. That case is flagged on the record and shown in the report
instead — asserting an independence that was never established would be worse than reporting the
fact. Real segregation of duties needs a team model with roles, which does not exist yet.

Reviewing is its own command — **Review Compliance Deviations** — listing proposals first and offering
only the decisions a record's state actually allows: approve or reject a proposal, revoke an approved
one, nothing for a settled record. The list carries the expiry and flags an approval entered from the
raiser's own account, so the ones nobody countersigned are visible without opening each record.
