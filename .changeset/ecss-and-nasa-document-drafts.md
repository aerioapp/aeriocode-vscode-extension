---
"Aerio-Code": patch
---

Draft ECSS and NASA deliverables, not just DO-178C's.

Both regimes shipped a profile whose answer to "what do you produce for me" was a list of things it
did not. The ECSS profile said Aerio "does not draft" ECSS deliverables, next to a DO-178C profile
drafting eleven. That was never a statement about ECSS — ECSS specifies its deliverables **more**
prescriptively than DO-178C does. Every DRD is a normative annex giving the section list outright,
where DO-178C section 11 gives a clause and a paragraph. There was no reason it was harder; it just
had not been built.

**ECSS** now drafts the sixteen DRDs of Annexes B–P and T — SSS, IRD, SRS, ICD, SDD, SRelD, SUM,
SVerP, SValP, SUITP, SVS, SVR, SRF, SDP, SRevP and SMP — 323 sections, with the standard's own
numbering kept as `<4.2>` so a supplier can check a section against the customer's copy.

**NASA** drafts the work products NASA-HDBK-2203 describes, 487 sections across 27 products. That
handbook has no PDF: NPR 7150.2D §6.2 defers document content to it and specifies none itself, and the
handbook is published only as a wiki — the file on the NASA standards site is a 5.9 KB pointer. So
each work product records the URL it was read from, because with no document there is no page number
to cite.

Neither set drafts prose. A section is populated from data Aerio holds, or it is marked
applicant-must-supply and left visibly empty — the same rule the DO-178C drafts follow, for the same
reason: a generator that wrote something into every section produces a document that reads as
complete, survives a skim, and is found out at the review, after delivery.

Three things this change refuses to do, each because the first attempt did it:

- **No section is mapped by a guessed number.** The first ECSS fill map had eleven entries and every
  one resolved — to the wrong section. `sdp:4.6` is "Monitoring and controlling mechanisms", not the
  coding standards; `suitp:4` is "Software overview", not the tests. Existence is the weaker half of
  the property, so each mapping now records the title it lands on, and a guard fails the build if a
  key stops resolving.
- **Structural coverage is not filed under the SVR.** It was tempting: coverage is a verification
  result and the SVR is the verification report. But SVR <5> is "Margin and technical budget status"
  and <6> is "Numerical accuracy analysis". Annex R makes the coverage report clause 5.8.3.5c/d, its
  own expected output, and that is where it stays.
- **Aerio does not draft NASA's assurance deliverables.** The Software Assurance Plan, Safety Plan,
  SA Status Report, IV&V Plan, Hazard Report and Audit Report belong to the assurance organisation
  under NASA-STD-8739.8B — the people whose job includes checking Aerio's own output. Their
  structures are shown so a project can see what it owes; the sections stay theirs to write.

Two citation errors are fixed along the way. The NASA profile listed the Software Requirements
Specification as **SWE-016**, which is the software *schedule*, and the Software Test Plan as
**SWE-024**, which is tracking results against the plan. Both identifiers exist in Appendix C, so the
guard that checks identifiers resolve had passed them. Requirements are SWE-050; test plans are part
of SWE-065, which already covered plans, procedures, tests and reports as one obligation — so that
line was a double count as well as a mis-citation.

Also fixed: the DO-178C document generator crashed on a partial payload. Its traceability filler
admitted any truthy value and then read two levels into it, so a client sending counts without the
reverse direction lost all eleven documents to a TypeError.
