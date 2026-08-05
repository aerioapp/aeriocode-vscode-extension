---
"Aerio-Code": patch
---

Hold generated code to a coding standard, per workspace.

Set `aeriocode.compliance.standard` (and optionally `aeriocode.compliance.level`) and Aeriocode
generates its system prompt from that standard's rule catalog, then analyses every file it writes
and returns violations to the model to fix. Bounded at three attempts per file, after which the
model is required to state the deviation rather than leave it unmentioned.

Off by default and scoped to the resource, so a certified repository and an internal tool can
differ without switching anything. A status bar entry shows which standard is in force.

The default standard is the Aerio Safety Coding Standard — 148 rules, 134 checked automatically,
adoptable as a programme's Software Code Standards under DO-178C §11.8. Aerio reports findings; it
does not certify, and whether the evidence suffices is decided by the applicant and their
certification authority.
