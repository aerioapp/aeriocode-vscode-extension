// Certification profile loaded from JSON config
export interface CertificationProfile {
	standard: string // 'DO-178C', 'ISO-26262', 'IEC-62304'
	version: string // 'C', '2018', etc.
	publisher: string // 'RTCA/EUROCAE'
	levels: Record<string, CertificationLevel>
	requirement_id_patterns: string[]
	requirement_levels: string[]
	traceability_directions: string[]
	safety_coding_rules?: string
	coding_standards?: string[]
}

export interface CertificationLevel {
	label: string
	failure_condition: string
	coverage_metric: string
	statement_coverage: number
	decision_coverage: number
	mcdc_coverage: number
	verification_independence: boolean
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

// Human decision capture params
export interface DecisionParams {
	generation_id: string
	user_id: string
	decision: "accepted" | "modified" | "rejected"
	files_affected?: string[]
	diff_summary?: string
	rationale?: string
	compliance_notes?: string
}

// Integrity verification result
export interface IntegrityResult {
	valid: boolean
	total_entries: number
	broken_at: number | null
	broken_hash?: string
	expected_hash?: string
}

// Coverage enforcement result
export interface CoverageEnforcement {
	requirements_met: number
	requirements_total: number
	passed: boolean
	level_id: string | null
	required_coverage: number
	actual_coverage: number
	coverage_metric: string
	message: string
}

// Certification manager status
export interface CertificationStatus {
	active: boolean
	profile: CertificationProfile | null
	profile_level: string | null
	traced_count: number
	untraced_count: number
	coverage_percent: number
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
