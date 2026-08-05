# Changelog

## 0.0.7

### Patch Changes

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

### Compliance Checking

- **JF-AV++ compliance checking** — Check C++ against the JF-AV++ coding standard (2RDU00001 Rev C) from the new Compliance panel, from the command palette ("Aeriocode: Check Compliance"), or against the active file. Findings carry the rule id, severity, line, and the rule's own text and rationale. Requires a signed-in Aerio account.
- **Findings in the Problems panel** — Violations are published as diagnostics, so they appear inline in the editor and in Problems alongside the rest of your tooling. Mandatory ("shall" / "will") rules are reported as errors and advisory ("should") rules as warnings, which makes the Problems error count the number of things that actually block conformance.
- **Tiered autofix** — Mechanical fixes are split in two. _Safe_ fixes are fully determined by the syntax and cannot change behaviour: literal and hexadecimal casing, adding braces, comment style, include notation, octal constants. _Review_ fixes are mechanically correct but carry semantic risk — `#define` to `const`, C-style cast to `static_cast`, splitting multi-variable declarations — and are applied only when you ask for them explicitly. Nothing is written until you choose a tier, and fixes land in the editor's undo stack.
- **The assistant can check its own work** — In JF-AV++ mode the assistant can run the compliance check on the C++ it just wrote and correct violations before presenting the result. Analysis is read-only and auto-approvable; autofix is not, and is unavailable in Plan mode.
- **Coverage is always stated** — Every result reports how many rules were checked automatically and how many need human review, so a clean run over a subset of the standard is never presented as full conformance.

### UI

- **Compliance & Certification menu** — Traceability and Audit Trail move into a single sidebar submenu alongside the new compliance check, rather than each taking a top-level slot.
- **Jump to a finding** — Selecting a finding opens the file with the cursor on the offending line.

## [0.0.5]

### Bug Fixes

- **Fixed LLM closing tag leak in write_to_file** -- Parser now correctly handles mismatched closing tags (e.g. wrong XML tags instead of correct ones) that caused stray XML tags to appear in written files.
- **Added fallback for alternative opening tags** -- Parser gracefully handles cases where the LLM uses wrong parameter tags for the content parameter.
- **Added ToolExecutor safety net** -- Trailing XML closing tags are now stripped from file content before writing.
- **Added system prompt tag format clarification** -- System prompt now explicitly warns that closing tags must match opening tags exactly.

## [0.0.4]

### Certification System

- **Profile-driven certification** — Certification levels, tags, and safety coding rules are now driven by the active DO-178C profile configuration.
- **AI awareness of requirements** — Certification requirement instructions are injected into the AI's system prompt, making the AI aware of active requirements, tag formats, and safety coding rules.
- **DAL-aware coverage enforcement** — Coverage enforcement now uses the profile's configured coverage metric and threshold, with pass/fail feedback in certification status.
- **Impact analysis** — New gRPC handler for analyzing which files, test files, and dependent requirements are affected by a requirement change.
- **Fixed requirement tag parser** — Tags like `SYS-001` and `REQ-SYS-001` are now consistently captured as full IDs, fixing mismatch issues.
- **Fixed coverage calculation** — Coverage now counts distinct traced requirements instead of distinct files, giving accurate coverage percentages.

### Profile Management

- **Deactivation/deletion separation** — Deactivating a profile removes `profile.json` and closes the database without deleting data. Deleting project data is a separate irreversible action with confirmation dialog.
- **Intentionally deactivated guard** — Prevents the extension from re-activating a profile that was explicitly deactivated by the user.

### UI Improvements

- **Rationale and Source fields** — Add Requirement form now includes rationale and source fields alongside title and description.
- **Updated tag placeholders** — Requirement tag input now shows `e.g., SYS-001 or HLR-42` with helper text about exact matching.

### Documentation

- **Certification docs** — New professional documentation covering certification overview, traceability workflow, and audit trail features.
- **Fixed docs routing** — Ingress `/docs` path now correctly routes to the frontend service.

### Bug Fixes

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
