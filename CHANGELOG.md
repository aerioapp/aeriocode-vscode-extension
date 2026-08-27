# Changelog

## 0.0.9

- cd8f846: Fix the compliance panel refusing every Ada and Rust file.

The engine has checked Ada and Rust against the Aerio Safety Coding Standard since 0.0.8, but the
panel's file-scope resolver only knew the C/C++ extensions — so choosing "active file" on a `.adb`,
`.ads` or `.rs` file always answered "not a file this standard applies to", regardless of the
standard selected or the file's actual name. `LANGUAGE_EXTENSIONS` now carries Ada's `.ads`/`.adb`/`.ada`
and Rust's `.rs`, matching the backend's own `core/parser.js` mapping.

## 0.0.8

- 732fc34: Check Ada and Rust against the Aerio Safety Coding Standard.

The engine parsed C and C++ and nothing else, which ruled out the two languages a safety-critical
programme is most likely to arrive with: Ada, which much European space flight software is written
in, and Rust, which much new work is starting in.

Both are now checked. Rules that need a type model are reported as not evaluated on Ada and Rust
rather than guessed at, and every run states which rules it did not evaluate, so a pass on one of
these languages is never mistaken for a pass on all of them.

- 732fc34: Add ECSS-E-ST-40C and NPR 7150.2D certification profiles.

DO-178C is no longer the only regime. A programme can now activate an ECSS or a NASA profile, each
with its own level vocabulary — design assurance level, software criticality category, software
classification — and its own obligation structure and document set.

No mapping is asserted between the three. All of them letter their levels from A, and they do not
mean the same thing by it: an ECSS criticality category depends on whether a compensating provision
exists outside the software, and a NASA classification follows the kind of mission and runs to F on
a separate axis. Each profile is presented in the structure its own publisher uses, and states what
Aerio does not produce for it in that regime's own terms.

- 732fc34: Draft the document set each regime defines.

ECSS programmes get drafts of the sixteen DRDs from Annexes B–P and T. NASA programmes get drafts of
the work products described in NASA-HDBK-2203. Software assurance deliverables are not drafted —
their required structure is shown, but they belong to the assurance organisation.

- 732fc34: Record a violation somebody decided to accept.

A mandatory finding that cannot be cleared previously had two options, and both were poor: ship a
failing pipeline, or freeze the violation into a baseline that carries no rationale, no approver and
no review date.

A deviation is the record that somebody decided to accept it. It carries a rationale, a named
approving authority and, for the widest scope, a review date. Scope is one violation, one rule in a
file, or one rule across the project.

A deviated finding stays in the report. Only its mandatory flag is cleared, so a gate stops asking
for repair while the report still shows the violation and who accepted it. The conformance verdict
says so in its own sentence rather than in a footnote.

- 732fc34: Raise a deviation from the lightbulb on the finding.

Raising and reviewing were reachable only from the command palette, which is where you go for
something you already know the name of. Raising is now a lightbulb action on the finding itself,
beside the repair actions — the two honest answers to a violation sit together.

Offered only on mandatory findings that no approved deviation already covers. Each entry names the
rule it would waive, and adds the line when one rule fires more than once in view.

Reviewing remains a separate command. An approve button beside a rationale somebody has just written
invites the self-approval the record exists to rule out.

- 732fc34: Withdraw the MISRA rule packs.

`misra-c` and `misra-cpp` are no longer selectable. Their guideline numbering could not be confirmed
against the published standards, and findings filed under a number nobody can vouch for are worse
than findings filed under Aerio's own.

The checks did not go anywhere. The Aerio Safety Coding Standard adopts them and reports them under
identifiers Aerio wrote and can stand behind. If you license MISRA yourself, supply your own rule
mapping per request and findings come back carrying your guideline numbers.

- 732fc34: Name the standard a profile is of, rather than its publisher.

The picker offered "ECSS" and "NASA" — a standards body with dozens of publications, and an agency
that publishes several software standards binding different parties. A supplier could not tell which
document their project had been activated against. Profiles are now named for the document.

- 732fc34: Count requirements in traceability coverage.

Traceability coverage was summed as an average of percentages, so a requirement with one linked
function counted the same as one with forty. Coverage is now the proportion of requirements that are
traced.

- 732fc34: Fix audit trail verification.

Verification could report a valid chain as broken for some accounts. Identifiers are now handled
consistently between the point an entry is recorded and the point it is checked.

Entries recorded before this release keep their original values and will not verify. There is no
migration for that, and none is possible. Verification did not previously succeed for the affected
accounts, so no previously working result is lost.

- 732fc34: Cite the active regime, or no regime at all.

Untraced-function warnings cited a DO-178C clause regardless of which profile was active, so ECSS
and NASA projects were shown a clause that does not govern them. All three regimes require
requirements-to-code traceability and number it differently; the warning now cites none rather than
one that may be wrong.

- 732fc34: Resolve local cluster hosts on IPv4 first.

A backend running on a local cluster could take the full connect timeout before answering, because
the address tried first had nothing listening and the packets were dropped rather than refused.

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
