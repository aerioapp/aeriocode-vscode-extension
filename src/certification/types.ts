/**
 * What a regime requires of one coverage metric at one level.
 *
 * ⚠️ **A number is not enough, and assuming it was is what forced this union.** Three regimes were
 * read against each other and each states something a percentage cannot express:
 *
 * - **DO-178C** fixes a number per level. `100`, or `0` where the level does not ask for that metric.
 * - **ECSS-E-ST-40C Rev.1** fixes 100% statement and decision coverage at categories A and B, and
 *   marks C and D **TBA** — a value to be agreed with the customer and measured per
 *   ECSS-Q-ST-80 clause 6.3.5.2. Storing that as `0` would tell a supplier no coverage is required;
 *   storing it as `100` would invent an agreement they have not made. Both are wrong, in opposite
 *   directions.
 * - **NPR 7150.2D** requires 100% MC/DC under SWE-219 **for safety-critical software components**,
 *   gated on the safety-critical determination rather than on the software class. A class A project
 *   whose software is not safety-critical has no percentage stated for it at all.
 *
 * So the vocabulary is four-valued, and the three non-numeric values are different claims:
 * `to-be-agreed` means the regime defers to the parties, `conditional` means the regime states a
 * number but only under a condition the tool cannot evaluate, and `not-applicable` means the regime
 * does not ask for this metric here.
 */
export type CoverageRequirement = number | "to-be-agreed" | "conditional" | "not-applicable"

/**
 * Whether a regime requires verification independent of the developer.
 *
 * Three-valued for the same reason. DO-178C requires it at Levels A and B and not below.
 * ECSS-E-ST-40C's Annex R marks the independent software verification and validation plans
 * (clauses 5.6.2.2 and 5.8.2.2) applicable at categories A and B and **not applicable** at C and D.
 * NPR 7150.2D only *recommends* it, in the note to SWE-219 — "it is recommended that someone
 * independent of the developer of the code under test design and perform this testing" — which is
 * neither required nor absent, and recording it as `false` would understate what the directive says.
 */
export type IndependenceRequirement = boolean | "recommended"

/**
 * One published document a profile is built from.
 *
 * ⚠️ A list rather than a single field, because **no regime here is one document.** ECSS splits
 * software engineering across ECSS-E-ST-40C and product assurance across ECSS-Q-ST-80C, and the
 * criticality categories a profile projects come from the second, not the first. NASA splits
 * engineering requirements (NPR 7150.2D) from assurance and safety (NASA-STD-8739.8B) and document
 * content again into NASA-HDBK-2203. Naming only one would credit a document with obligations it
 * does not contain.
 */
export interface SourceDocument {
	/** The publisher's own identifier, e.g. `ECSS-Q-ST-80C`. */
	id: string
	/** The issue this profile was built from, e.g. `Rev.2`. Empty where the id carries it. */
	revision: string
	/** What the document is, in its publisher's words. */
	title: string
	/** What this profile takes from it — stated so a reader can tell which document answers what. */
	role: string
}

// Certification profile loaded from JSON config
export interface CertificationProfile {
	/**
	 * The specific document this profile certifies against — `DO-178C`, `ECSS-E-ST-40C`,
	 * `NPR-7150.2D`.
	 *
	 * ⚠️ **Not the publisher's name.** This read `ECSS`, which is a standards body with dozens of
	 * publications, and a panel showing "ECSS" told a supplier nothing about which of them their
	 * project had been activated against. `NASA` would have been worse still: NPR 7150.2D and
	 * NASA-STD-8739.8B impose different obligations on different parties. The full set each profile
	 * draws on is in {@link based_on}; this names the one it is *of*.
	 */
	standard: string
	/** The issue of {@link standard} — `C`, `Rev.1`, `D`. */
	version: string
	/** Who publishes it — 'RTCA/EUROCAE', 'ECSS / ESA', 'NASA'. */
	publisher: string
	/** What {@link standard} is called, so a screen can show more than an identifier. */
	title?: string
	/** Every published document this profile is built from, including {@link standard}. */
	based_on?: SourceDocument[]
	levels: Record<string, CertificationLevel>
	requirement_id_patterns: string[]
	requirement_levels: string[]
	traceability_directions: string[]
	safety_coding_rules?: string
	coding_standards?: string[]
	/**
	 * The regime id this profile belongs to, matching `@shared/compliance/regimes`.
	 *
	 * Present so the certification profile and the coding-standard regime cannot disagree about
	 * which scale a level letter belongs to — the failure that had an ECSS category B session
	 * displaying as "DAL B".
	 */
	regime?: string
	/** What a level letter means here, and where that is defined. A citation, never reproduced text. */
	level_basis?: string
	/**
	 * ⚠️ What this profile does **not** cover, stated on the profile rather than left to be found.
	 *
	 * Aerio's Annex A objective tables and its eleven document drafts are DO-178C artifacts. A
	 * non-DO-178C profile gets the coding standard, the analysis and the audit trail; it does not get
	 * an objectives dashboard for its own regime, because neither ECSS nor NPR 7150.2D organises
	 * around an objective grid and projecting one onto them would invent a structure the publisher
	 * does not use.
	 */
	unsupported_artifacts?: string[]
}

export interface CertificationLevel {
	label: string
	/**
	 * Why software is assigned this level.
	 *
	 * ⚠️ Named `failure_condition` for DO-178C, where it is exactly that. It is **not** a failure
	 * condition under the other two: an ECSS category is a function's severity category modulated by
	 * whether a compensating provision exists outside the software, and a NASA class is assigned from
	 * the kind of mission the software serves. The field is kept for compatibility and the text says
	 * which of the three it is.
	 */
	failure_condition: string
	/**
	 * Why software lands at this level, in a sentence a screen can show.
	 *
	 * Separate from {@link failure_condition}, which a dropdown renders inline and therefore has to
	 * stay short. Overloading one field with both the classification and its explanation produced
	 * option labels a paragraph long the first time a non-DO-178C profile was rendered.
	 */
	assigned_from?: string
	coverage_metric: string
	statement_coverage: CoverageRequirement
	decision_coverage: CoverageRequirement
	mcdc_coverage: CoverageRequirement
	/** Present where a coverage value is `conditional`; states the condition in the regime's words. */
	coverage_condition?: string
	/**
	 * Object-code coverage, which only ECSS states as a level requirement — 100% at category A where
	 * source-to-object traceability cannot be verified, and not applicable at B, C and D. DO-178C
	 * treats source-to-object traceability as a Level A objective Aerio explicitly does not cover.
	 */
	object_code_coverage?: CoverageRequirement
	verification_independence: IndependenceRequirement
	required_artifacts: string[]
}

// Database row types
export interface RequirementRow {
	id: number
	requirement_id: string
	level: string
	title: string
	description: string | null
	dal_level: string | null
	status: string
	parent_requirement_id: string | null
	source: string | null
	rationale: string | null
	change_history: string
	created_at: string
	updated_at: string
}

export interface TraceabilityLinkRow {
	id: number
	requirement_id: string
	artifact_type: string
	artifact_path: string | null
	artifact_line_start: number | null
	artifact_line_end: number | null
	artifact_content_hash: string | null
	link_type: string
	confidence: string
	is_verified: number
	verified_by: string | null
	verified_at: string | null
	created_at: string
	updated_at: string
}

export interface AuditTrailRow {
	id: number
	entry_hash: string
	previous_hash: string | null
	event_type: string
	event_action: string
	user_id: string | null
	session_id: string | null
	task_id: string | null
	timestamp: string
	entity_type: string | null
	entity_id: string | null
	model_id: string | null
	model_version: string | null
	profile_id: number | null
	payload: string // JSON string
}

export interface AiGenerationRow {
	id: number
	generation_id: string
	user_id: string | null
	session_id: string | null
	task_id: string | null
	model_id: string
	model_version: string | null
	provider: string | null
	user_message: string | null
	user_message_hash: string | null
	files_read: string // JSON array
	files_written: string // JSON array
	tool_calls: string // JSON array
	requirement_tags_found: string // JSON array
	started_at: string | null
	completed_at: string | null
	duration_ms: number | null
	audit_entry_id: number | null
	created_at: string
}

export interface HumanDecisionRow {
	id: number
	decision_id: string
	generation_id: string | null
	user_id: string | null
	decision: string
	files_affected: string // JSON array
	diff_summary: string | null
	rationale: string | null
	compliance_notes: string | null
	presented_at: string | null
	decided_at: string | null
	decision_duration_ms: number | null
	audit_entry_id: number | null
	created_at: string
}

export interface IntegrityCheckRow {
	id: number
	check_type: string
	check_at: string
	total_entries: number
	valid_entries: number
	invalid_entries: number
	details: string | null
	passed: number
}

export interface ProjectIndexRow {
	id: number
	project_path: string
	project_name: string | null
	profile_standard: string | null
	profile_level: string | null
	last_activity_at: string | null
	total_generations: number
	total_decisions: number
	traceability_coverage: number
	created_at: string
	updated_at: string
}

export interface ExportHistoryRow {
	id: number
	project_path: string
	export_type: string
	format: string
	file_path: string
	entry_count: number | null
	exported_at: string
}

// Parsed requirement tag from source code
export interface ParsedRequirementTag {
	requirement_id: string
	description: string
	level?: string
	safety_critical?: boolean
	line: number
	column: number
}

// Untraced function detected in source code
export interface UntracedFunction {
	name: string
	start_line: number
	end_line: number
	file_path: string
	language: string
}

// Audit event parameters
export interface AuditEventParams {
	event_type: string
	event_action: string
	user_id?: string
	session_id?: string
	task_id?: string
	entity_type?: string
	entity_id?: string
	model_id?: string
	model_version?: string
	profile_id?: number
	payload: Record<string, unknown>
}

// AI generation tracking params
export interface GenerationStartParams {
	generation_id: string
	user_id?: string
	session_id?: string
	task_id?: string
	model_id: string
	model_version?: string
	provider?: string
	user_message?: string
	files_read?: string[]
	files_written?: string[]
	tool_calls?: string[]
	requirement_tags_found?: string[]
}

/**
 * What a decision was made about.
 *
 * A compliance autofix is deterministic tool output, not a model suggestion. Recording it
 * against `ai_suggestion` — or worse, writing a synthetic row into `ai_generations` to
 * give it a generation to point at — would corrupt exactly the data a certification
 * authority scrutinises most closely: what the AI actually produced.
 */
export type DecisionSubjectType = "ai_suggestion" | "compliance_autofix"

// Human decision capture params
export interface DecisionParams {
	/** Present for AI suggestions. Absent for deterministic tool output. */
	generation_id?: string
	user_id: string
	decision: "accepted" | "modified" | "rejected"
	files_affected?: string[]
	diff_summary?: string
	rationale?: string
	compliance_notes?: string
	/** Defaults to "ai_suggestion" so existing callers are unaffected. */
	subject_type?: DecisionSubjectType
	/** Identifies the subject when there is no generation — e.g. the standard id. */
	subject_id?: string
	/** Active certification profile, supplied by CertificationManager. */
	profile_id?: number
}

/**
 * Identifies the analysis that produced a compliance result, as reported by the backend.
 *
 * Without this a finding cannot be reproduced or explained later: two runs that disagree
 * are only accountable if each says which engine and rule set it came from.
 */
export interface ComplianceProvenance {
	engineVersion: string
	engineFingerprint: string
	standard: string
	standardVersion: string
	catalogHash: string
}

/** One analyzed file, identified by content hash. The source itself is never recorded. */
export interface ComplianceFileRecord {
	path: string
	content_sha256: string
}

export interface ComplianceCheckParams {
	provenance: ComplianceProvenance
	standard_name: string
	files: ComplianceFileRecord[]
	/**
	 * How the run was started — the model's tool call, the panel, a save, the palette, or the
	 * post-write gate.
	 *
	 * `gate` is distinct from `tool` on purpose. A `tool` run is the model deciding to check its
	 * work; a `gate` run happened whether it decided to or not. For evidence that difference is the
	 * whole point — one shows the assistant's judgement, the other shows the code was checked.
	 */
	trigger: "tool" | "panel" | "diagnostics" | "command" | "gate"
	task_id?: string
	user_id?: string
	violated_rule_ids: string[]
	total_findings: number
	mandatory_violations: number
	mandatory_clean: boolean
	score: number | null
	rules_automated: number
	/**
	 * A subset of `rules_automated`: rules whose check declares an analysis limit it does not
	 * reach. Null when the backend predates the field — which is not the same as zero, and the
	 * audit record must not claim it is.
	 */
	rules_partially_automated: number | null
	rules_manual_review: number
	/** True when the backend capped the finding list; the counts above remain truthful. */
	truncated: boolean
}

export interface ComplianceAutofixParams {
	provenance: ComplianceProvenance
	standard_name: string
	tier: "safe" | "review"
	trigger: "tool" | "panel" | "diagnostics" | "command" | "gate"
	task_id?: string
	user_id?: string
	/** Before/after hashes per file, so an applied fix is attributable to exact content. */
	files: Array<ComplianceFileRecord & { fixed_sha256: string; changed: boolean }>
	applied_rule_ids: string[]
	fixes_applied: number
	fixes_skipped: number
}

// Integrity verification result
export interface IntegrityResult {
	valid: boolean
	total_entries: number
	broken_at: number | null
	broken_hash?: string
	expected_hash?: string
}

/**
 * Where a project stands against its assurance level.
 *
 * Traceability coverage and structural coverage are separate objectives under DO-178C and
 * one cannot stand in for the other. This interface deliberately has no general `passed`:
 * it previously did, computed from traceability alone while reporting the level's
 * structural metric alongside it, which amounted to telling a DAL A user their MC/DC
 * objective was satisfied by requirement links. Structural coverage is reported as
 * unavailable until something measures it.
 */
export interface CoverageEnforcement {
	requirements_met: number
	requirements_total: number
	level_id: string | null
	message: string

	traceability_passed: boolean
	required_traceability_coverage: number
	traceability_coverage: number

	/** What the level demands: MC/DC at DAL A, decision at DAL B, statement at DAL C. */
	required_structural_metric: string
	/** False until a coverage run has been ingested. */
	structural_coverage_available: boolean
	/** Meaningless while `structural_coverage_available` is false. */
	structural_coverage: number | null
}

// Certification manager status
export interface CertificationStatus {
	active: boolean
	profile: CertificationProfile | null
	profile_level: string | null
	traced_count: number
	untraced_count: number
	/** Requirements with at least one link, over all requirements. Not structural coverage. */
	traceability_coverage_percent: number
	last_audit_entry: string | null
	integrity_status: "valid" | "invalid" | "unchecked"
	enforcement: CoverageEnforcement | null
}

// Export options
export interface ExportOptions {
	format: "csv" | "xlsx" | "pdf"
	start_date?: string
	end_date?: string
	include_metadata?: boolean
}

// Traceability matrix row for export
export interface TraceabilityMatrixRow {
	requirement_id: string
	requirement_level: string
	title: string
	dal_level: string | null
	status: string
	linked_source_files: string[]
	linked_test_files: string[]
	linked_documents: string[]
	coverage_percent: number
}

// Impact analysis result
export interface ImpactAnalysisResult {
	requirement_id: string
	requirement: RequirementRow
	affected_files: Array<{
		file_path: string
		line_start: number
		line_end: number
		link_type: string
	}>
	affected_tests: Array<{
		file_path: string
		link_type: string
	}>
	cascading_requirements: string[]
}

// Extension state additions for certification
export interface CertificationExtensionState {
	certification_active: boolean
	certification_profile_standard: string | null
	certification_profile_level: string | null
	certification_coverage_percent: number
	certification_integrity_status: string
}
