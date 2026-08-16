# Changelog

## 0.0.8

- 732fc34: Check Ada and Rust against the Aerio Safety Coding Standard.

The engine parsed C and C++ and nothing else, which ruled out the two languages a safety-critical
programme is most likely to arrive with today: Ada, which most European space flight software is
written in, and Rust, which most new work is starting in.

**Ada was previously recorded as blocked, and that assessment was wrong on both counts.** No Ada
grammar exists on npm — `tree-sitter-ada` and every obvious variant are 404 — but `briot/tree-sitter-ada`
is MIT-licensed source and builds to a working WASM in about a minute. It is vendored under
`core/grammars/` with its commit, hash and rebuild instructions, because a binary in the tree is a
supply-chain decision rather than a build step.

The second objection was that the rules could not be invented. That is true of a pack claiming to
implement Ravenscar or the ESA/BSSC standards, and attributing rules to a document nobody holds is
exactly what withdrew the two MISRA packs — but the Aerio Safety Coding Standard is Aerio's own
document. Extending it to a language is authoring Aerio's rules for that language. There was never a
licensing question to answer.

Most rules needed no new text, because the requirement was already language-neutral: CTRL-1 finds
Ada's `goto`, CTRL-7 finds a `case` with no `when others`, LOOP-1 finds a bare `loop` with no exit
and a Rust `loop` with no break, ERR-4 finds `when others => null`, and the size and complexity
limits apply to a `subprogram_body` and a `function_item` as readily as to a function definition.

Three rules are new, for hazards with no C or C++ equivalent:

- **LIB-12** — a construct that switches off a compiler or run-time check is used only where the
plans permit it, and each use states at the site what makes it sound. Ada's `pragma Suppress` and
Rust's `unsafe`. ⚠️ Not a prohibition: a driver or an FFI boundary genuinely needs one. What the
rule asks is that the reasoning be written down, because after the construct it is the only
verification evidence there will be — and an `unsafe` block with a stated justification passes.
- **ERR-8** — an operation that terminates the program is not used where the failure is recoverable.
Rust's `unwrap`, `expect`, `panic!`, `todo!`. Not reported inside `#[test]` or `#[cfg(test)]`,
because `unwrap` in a test is the correct thing to write and reporting it would put a finding in
every test file in the project.
- **TYPE-16** — a value's representation is not reinterpreted as a different type. Ada's
`Unchecked_Conversion`, Rust's `transmute`. The general form of what TYPE-11 says about
`reinterpret_cast`.

`metricsProfile` may now be keyed by language. C and C++ share their node type names closely enough
that one profile served both, which is why this was a single object; Ada and Rust share nothing with
them — a function is `subprogram_body`, `function_item` and `function_definition` in the three
grammars — and a profile naming node types that do not occur makes every metric read zero, which
presents as a simple clean file rather than an unmeasured one.

Two bugs the tests caught and one found in the field are fixed. Ada's parameter count read the type
mark as a parameter, so `procedure Q (A, B, C : Integer)` reported four; the Rust metrics check read
`metrics.parameterCount` where the engine returns `metrics.parameters`, so `undefined > 7` was
always false and IFACE-2 could never fire in Rust. Separately, the evidence store compared a numeric
user id against a TEXT column with `!==`, so every project-scoped request 404'd immediately after the
project registered successfully — that made the audit trail and evidence sync unusable for any user
the SSO could resolve, and looked like a permissions problem rather than a type coercion.

- 732fc34: Record a finding somebody decided to accept, instead of hiding it in a baseline.

The compliance gate already told the model that "a deviation somebody decided on is acceptable, a
silent one is not". There was nowhere to put one. A programme with mandatory findings it could not
clear had two options and both were bad: ship a red pipeline, or freeze the violations into a
baseline — which makes the build green, carries no rationale, no approver and no review date, and
hands an auditor a file that silently suppresses violations for no stated reason.

**The second is worse and it is what people do**, because a baseline is already there and it works.
Offering baselines without offering this is what made that the path of least resistance.

A deviation now carries what every regime that permits one asks for. NPR 7150.2D 3.7.5 [SWE-220]
says an exceedance is _reviewed and waived with rationale_ by the project manager or technical
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

- 732fc34: Make deviations reachable from the violation, instead of only from the command palette.

Raising and reviewing a deviation shipped as palette commands with no button, no menu entry and no
code action anywhere. Everything worked, and nobody could find it: the palette is where you go for
something you already know the name of, and a programme staring at a mandatory finding it cannot
clear had no way to learn that deviations exist.

⚠️ The gap was invisible from inside the code because the feature is complete and tested. It showed
up the first time somebody was asked to use it and answered "I don't have such option in extension".

**Raising is now a lightbulb action on the finding.** The cursor is already on the violation, the
squiggle is under it, and "Fix with Aeriocode" is in the same menu — _fix it_ and _I cannot fix it_
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

- 732fc34: Draft ECSS and NASA deliverables, not just DO-178C's.

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
Specification as **SWE-016**, which is the software _schedule_, and the Software Test Plan as
**SWE-024**, which is tracking results against the plan. Both identifiers exist in Appendix C, so the
guard that checks identifiers resolve had passed them. Requirements are SWE-050; test plans are part
of SWE-065, which already covered plans, procedures, tests and reports as one obligation — so that
line was a double count as well as a mis-citation.

Also fixed: the DO-178C document generator crashed on a partial payload. Its traceability filler
admitted any truthy value and then read two levels into it, so a client sending counts without the
reverse direction lost all eleven documents to a TypeError.

- 732fc34: Give ECSS and NASA certification profiles of their own, built from their own documents.

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
rows. SWE-219 and SWE-220 are reported as _conditional_ rather than applicable, because their text
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

- 732fc34: Fix the two places a user id's JavaScript type silently disabled the evidence trail.

`user_id` is a TEXT column, so Postgres hands back `"6"`. `req.user.id` is a **number** whenever the
SSO's by-id lookup resolves the account and a **string** when the middleware falls back to the
response header — the same user arrives in two shapes depending on which path ran. Both bugs below
are that mismatch, and both were found by exercising the API against a real database rather than a
fake pool.

**Every project-scoped request 404'd.** The ownership check compared with `!==`, so the insert
succeeded — Postgres coerces on the way in — and every read afterwards failed. A project registered
successfully and was then reported as not existing on the very next call. It read as a permissions
problem, which is the wrong place to look.

**No chain could ever verify.** An entry is sealed from whatever the caller had in hand and verified
from what the database returns, and `canonicalize({userId: 6})` is not `canonicalize({userId: "6"})`.
⚠️ What let this survive is that the symptom is indistinguishable from success: `valid: false,
brokenAtSeq: 1` is exactly what a genuinely tampered trail produces, so the integrity check appeared
to be working and reporting a real problem. It was reporting itself.

Identifier fields are now normalised to text inside `hashableEntry`, so the canonical form of an
entry cannot depend on which path through the auth middleware ran. Ownership is compared the same
way, with null and undefined never equal to anything so an unauthenticated caller cannot match a
project whose owner coerces to the same string.

⚠️ **Entries written before this fix keep their old hashes and will not verify.** There is no
migration for that and none is possible — the stored hash commits to the bytes it was sealed from.
Since verification never passed for these users, nothing that previously worked is lost.

- 732fc34: Fix every backend call hanging for ten seconds against a local cluster.

A compliance check reported "Aerio did not respond in time" after a ten-second wait, and telemetry
failed alongside it with `ConnectTimeoutError`. Neither the server nor the request code was involved.

1. `code.localhost` resolves to `::1` before `127.0.0.1`. Node has honoured the resolver's own order
rather than reordering it since v17.
2. A kind cluster publishes its ingress as `0.0.0.0:9080` — IPv4 only. Nothing listens on `[::1]:9080`.
3. Connecting there is not refused, it is **dropped**. There is no fast error to fall back from, so
the socket waits out undici's full ten-second connect budget and then reports what looks like a
server that never answered.

What made this hard to see from the outside is that it reproduces nowhere else. `curl` races both
address families, and Node 20+ has `autoSelectFamily` doing the same — so the identical URL succeeds
from a terminal and from a plain `node` script while the extension times out. VS Code bundles its own
undici and does not get that behaviour.

The extension host now sets `dns.setDefaultResultOrder("ipv4first")` at activation. That is what Node
itself defaulted to before v17, it costs nothing against the production hosts, and it is set once for
the process so that axios, `fetch` and the telemetry sender cannot disagree about it.

The three links in the chain are asserted directly rather than through a mocked client — resolution
order, the IPv4/IPv6 asymmetry against the running listener, and that setting the order puts the
reachable address first. The middle test asserts the connection **times out rather than being
refused**, because that distinction is the whole reason the failure was slow instead of instant.

- 732fc34: Add the NASA software classification regime, and make every assurance regime selectable.

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

- 732fc34: Name the standard a profile certifies against, not the body that publishes it.

The ECSS profile identified itself as `ECSS` and the NASA one as `NASA-NPR-7150.2D`. ECSS is a
standards body with dozens of publications, several of which bear on a space software programme, so a
panel reading "ECSS" told a supplier which organisation they answered to and not which document.
DO-178C was already specific, because DO-178C _is_ the document — which is why the problem was easy to
miss on the screen where all three appear together.

They are now `ECSS-E-ST-40C` Rev.1 and `NPR-7150.2D`, each carrying the title of the standard so a
screen can say what it is rather than only identify it.

**And a profile now names every document it is built from, because none of them is one document.**
That is not presentation: the ECSS profile's criticality categories come from **ECSS-Q-ST-80C**, not
from the standard it is named after, and without that document the four categories are four letters
with no defined meaning. The NASA profile draws on NPR 7150.2D for classifications and applicability,
NASA-STD-8739.8B for the assurance obligations it deliberately does not draft, and NASA-HDBK-2203 for
what each work product contains. Naming only the headline standard would credit it with obligations it
does not contain.

The DO-178C entry states its own gap in the same place: DO-330 is listed, with a note that Aerio does
not hold it and the qualification kit's clause references are unverified against it.

⚠️ A project activated under an old name keeps working. `ECSS` and `NASA-NPR-7150.2D` are written into
`.aeriocode/profile.json`, and a rename without aliases would have made the loader return null — which
the certification module reports as _no profile_, so the project would have kept its requirements and
audit trail while silently no longer being held to anything. The aliases resolve but are not offered,
so each profile still appears once in the picker under its real name.

- 732fc34: Fix the traceability figure the certification status bar and the enforcement gate report.

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

- 732fc34: Withdraw the MISRA C and MISRA C++ rule packs.

`misra-c` and `misra-cpp` are no longer values of `aeriocode.compliance.standard`, and the backend
answers a request for either with a 404 that says why rather than the generic "unknown standard".

They were authored from recollection: 307 guidelines whose analysis was sound and whose _numbers_
nobody could confirm, cited to the user as provisional. Confirming them means reading a licensed copy
of the document, and MISRA's licence names validating an AI tool against it as a prohibited use — so
the diligent act was the one that would have created the breach, and the numbers could never stop
being provisional.

**A workspace with either selected loses a rule number, not analysis.** The checks still run:
`aerio-scs` adopts them and reports the findings under rule ids Aerio authored. The setting is not
rewritten and the value is not silently dropped — the 404 names the pack, says it was withdrawn, and
points at the standard now carrying its checks. A programme that holds a MISRA licence maps Aerio's
rule ids onto its own copy, inside its own licence, which is the only place that mapping may live.

This is recorded separately from the regime work because it is a different decision with a different
reason, and a reader looking for why a standard they had selected disappeared should not have to find
it inside a note about NASA classifications.

## 0.0.7

- ed8b6a5: Set the coding standard from the chat input, and show when none is set.

The standard was a workspace setting with no UI, and the only indicator hid itself when nothing was
enforced — so the state this feature exists to prevent, believing generated code is being held to a
standard when it is not, was the one state with nothing on screen. Two sessions ran that way; in the
second the model, asked why its file did not comply, went looking for the standard's documentation
on the web, because without a profile the rules never reach the prompt at all.

A picker now sits beside the model name: standard, regime, assurance level and whether to check code
after every write. It reads through the same resolver the request path and the gate use, so it
cannot show a profile the model was never instructed under, and the standards list comes from the
backend so a newly published pack needs no extension release. The status bar shows a dormant state
for C and C++ files rather than disappearing.

The assurance level now has one source. An active certification profile declares it — that is a
certification act, recorded in the audit trail — and the setting is the route for a project using
the coding standard without the certification module. Previously each had its own store, so the
certification screen could report DAL A while the coding-standard screen reported none, with nothing
telling a user which the model was actually held to.

- ed8b6a5: Fix three ways an edit could fail without saying so.

`replace_in_file` matches SEARCH text against the file, and three shapes it should have accepted were
being rejected — two of them silently, which is worse than a rejection because a rejection can be
retried and a silent no-op cannot even be noticed.

**Indented markers matched nothing.** The marker patterns were anchored and tested against the
untrimmed line, so `    ------- SEARCH` — indented because the model is editing inside a class body
and matching the surrounding code — was not recognised as a marker at all. With no markers found the
diff parsed as containing _no blocks_, and the file came back unchanged with no error raised: the
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

- ed8b6a5: Report a rule by its own id, not under another standard's prefix.

Every compliance finding was rendered `AV Rule <id>` — correct while JF-AV++ was the only pack, and
inherited unchanged by the four packs added since. So an Aerio Safety Coding Standard violation
reached the user as `AV CTRL-4`, and a MISRA one as `AV Rule Rule 17.6`: identifiers belonging to no
standard, in the Problems panel, the compliance panel, and the text the compliance gate feeds
straight into its repair turn.

Rule ids already carry their own namespace, so there is nothing for a prefix to add and any fixed
one is wrong for four of the five packs. Fixed in all four places that rendered it, with a test
using an id that carries its own namespace — every existing fixture used a bare JF-AV++ number,
where the wrong prefix reads as the right one, which is why no test caught this.

- ed8b6a5: Hold generated code to a coding standard, per workspace.

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

- d2efbf3: Adding safety guard for workspace root
- ed8b6a5: Recover tool calls the model gets slightly wrong, instead of reporting them as nothing.

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

- ed8b6a5: Never save a file from a response that was cut off part-way.

When a generation hit its output token limit, the incomplete tool call it contained was completed
and executed anyway, so a source file that stopped mid-function was written to disk looking whole —
and then analysed, and reported on, as though it were the file the model meant to write.

A truncated response now discards its incomplete tool call and asks the model to retry with a
smaller one. Nothing is written in the meantime, and the retry is not counted against the mistake
limit, because being cut off is not the model's error.

- d2efbf3: calibrate input token counts when using anthropic models of sap ai core provider

## [0.0.6]
- **JF-AV++ compliance checking** — Check C++ against the JF-AV++ coding standard (2RDU00001 Rev C) from the new Compliance panel, from the command palette ("Aeriocode: Check Compliance"), or against the active file. Findings carry the rule id, severity, line, and the rule's own text and rationale. Requires a signed-in Aerio account.
- **Findings in the Problems panel** — Violations are published as diagnostics, so they appear inline in the editor and in Problems alongside the rest of your tooling. Mandatory ("shall" / "will") rules are reported as errors and advisory ("should") rules as warnings, which makes the Problems error count the number of things that actually block conformance.
- **Tiered autofix** — Mechanical fixes are split in two. _Safe_ fixes are fully determined by the syntax and cannot change behaviour: literal and hexadecimal casing, adding braces, comment style, include notation, octal constants. _Review_ fixes are mechanically correct but carry semantic risk — `#define` to `const`, C-style cast to `static_cast`, splitting multi-variable declarations — and are applied only when you ask for them explicitly. Nothing is written until you choose a tier, and fixes land in the editor's undo stack.
- **The assistant can check its own work** — In JF-AV++ mode the assistant can run the compliance check on the C++ it just wrote and correct violations before presenting the result. Analysis is read-only and auto-approvable; autofix is not, and is unavailable in Plan mode.
- **Coverage is always stated** — Every result reports how many rules were checked automatically and how many need human review, so a clean run over a subset of the standard is never presented as full conformance.
- **Compliance & Certification menu** — Traceability and Audit Trail move into a single sidebar submenu alongside the new compliance check, rather than each taking a top-level slot.
- **Jump to a finding** — Selecting a finding opens the file with the cursor on the offending line.

## [0.0.5]
- **Fixed LLM closing tag leak in write_to_file** -- Parser now correctly handles mismatched closing tags (e.g. wrong XML tags instead of correct ones) that caused stray XML tags to appear in written files.
- **Added fallback for alternative opening tags** -- Parser gracefully handles cases where the LLM uses wrong parameter tags for the content parameter.
- **Added ToolExecutor safety net** -- Trailing XML closing tags are now stripped from file content before writing.
- **Added system prompt tag format clarification** -- System prompt now explicitly warns that closing tags must match opening tags exactly.

## [0.0.4]
- **Profile-driven certification** — Certification levels, tags, and safety coding rules are now driven by the active DO-178C profile configuration.
- **AI awareness of requirements** — Certification requirement instructions are injected into the AI's system prompt, making the AI aware of active requirements, tag formats, and safety coding rules.
- **DAL-aware coverage enforcement** — Coverage enforcement now uses the profile's configured coverage metric and threshold, with pass/fail feedback in certification status.
- **Impact analysis** — New gRPC handler for analyzing which files, test files, and dependent requirements are affected by a requirement change.
- **Fixed requirement tag parser** — Tags like `SYS-001` and `REQ-SYS-001` are now consistently captured as full IDs, fixing mismatch issues.
- **Fixed coverage calculation** — Coverage now counts distinct traced requirements instead of distinct files, giving accurate coverage percentages.
- **Deactivation/deletion separation** — Deactivating a profile removes `profile.json` and closes the database without deleting data. Deleting project data is a separate irreversible action with confirmation dialog.
- **Intentionally deactivated guard** — Prevents the extension from re-activating a profile that was explicitly deactivated by the user.
- **Rationale and Source fields** — Add Requirement form now includes rationale and source fields alongside title and description.
- **Updated tag placeholders** — Requirement tag input now shows `e.g., SYS-001 or HLR-42` with helper text about exact matching.
- **Certification docs** — New professional documentation covering certification overview, traceability workflow, and audit trail features.
- **Fixed docs routing** — Ingress `/docs` path now correctly routes to the frontend service.
- Fixed VS Code mock infrastructure for unit testing (198 tests passing).
- Fixed Logger resilience with HostProvider fallback for non-VS Code environments.
- Fixed WASM path resolution for sql.js database initialization.
- Fixed TypeScript config for mocha test runner compatibility.

## [0.0.3]

- Updated dependencies to latest versions (Anthropic SDK, Google GenAI, OpenAI, MCP SDK, PostHog)
- Added new tool handlers: ApplyPatch, WebSearch, GenerateExplanation, LoadMcpDocumentation, AccessMcpResource
- Added ToolExecutorCoordinator, ToolValidator, and PatchParser utilities
- Added BannerService, FeatureFlagsService, TempManager, MCP OAuth support, and CommandPermissionController
- Added new UI components: ThinkingRow, DiffEditRow, CompletionOutputRow, CommandOutputRow, SearchResultsDisplay, RequestStartRow, TypewriterText, FeatureTip, ContextWindowSummary, Highlights, ViewHeader, WhatsNewModal, BannerCarousel, ScreenReaderAnnounce
- Added Jupyter notebook integration (generate, explain, improve cells)
- Added AI code review comment support
- Updated protobuf definitions with new enum values, messages, and RPCs
- Added onUri activation event

## [0.0.2]

- fix: resolve telemetry HTTP 401 by using correct backend URL and adding auth token

## [0.0.1]

Initial release of Aeriocode - AI-powered aerospace and engineering coding assistant for VS Code.
