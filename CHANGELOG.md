# Changelog

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
