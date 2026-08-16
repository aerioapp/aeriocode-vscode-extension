---
"Aerio-Code": patch
---

Add the NASA software classification regime, and make every assurance regime selectable.

The coding-standard picker offered DO-178C and ISO 26262 only, so the ECSS regime — which ships with
a full per-category rule projection — could not be turned on from the UI at all. Worse, setting it by
hand in `settings.json` did not stick: the profile writer collapsed anything that was not ISO 26262
back to DO-178C, so the settings file ended up asserting an airborne design assurance level the user
never chose. The status bar had the matching defect, labelling every non-automotive level a "DAL", so
an ECSS category B session displayed as "DAL B".

All four regimes are now selectable, stored as chosen, and shown with their own publisher's word for
a level — DAL, Category, Class or ASIL. Regimes and their levels come from one definition shared by
the picker, the resolver, the profile writer and the status bar, rather than four copies.

The new NASA regime follows NPR 7150.2D and is deliberately not ECSS with two extra letters: it has
six classifications, they are not one severity scale (class F is business and IT software on a
separate axis, and it carries the coding-standard requirement that class E does not), no rule of the
standard applies at class E because the directive asks no coding requirement of class E software, and
the eight rules governing AI-assisted authoring do not apply at class D and return at class F. A
level that does not belong to the selected regime is still dropped and reported rather than applied.

It also adds ECSS and NASA **certification profiles**, where only DO-178C existed. `ProfileLoader`
special-cased `"DO-178C"` and fell through to the filesystem for anything else, so a project on
another regime got `null` — reported as "no profile" rather than "not supported". The three profiles
are deliberately different shapes rather than one template relabelled: DO-178C fixes a coverage
number per level and shrinks its artifact list; ECSS keeps the same sixteen deliverables at every
category and marks coverage below category B "to be agreed with the customer"; NASA gates coverage on
whether the software is safety-critical rather than on its class, and class E carries two artifacts
because that is all the directive asks of it.

Coverage and independence gained non-numeric values for this — `to-be-agreed`, `conditional`,
`not-applicable`, `recommended` — because a percentage cannot say "the parties will agree this" and
`false` cannot say "the directive recommends it". Each non-DO-178C profile also states what Aerio
does not produce for it: the Annex A objective tables and the eleven document drafts are DO-178C
artifacts, and neither ECSS nor NPR 7150.2D organises around an objective grid.

ISO 26262 gets no certification profile, for the same reason it is not offered in the picker.
