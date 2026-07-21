# Changelog

## 0.0.5

### Patch Changes

- d2efbf3: Adding safety guard for workspace root
- d2efbf3: calibrate input token counts when using anthropic models of sap ai core provider

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
