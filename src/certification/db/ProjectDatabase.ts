import { SqlJsDatabase } from "./SqlJsDatabase"
import * as fs from "fs"
import * as path from "path"
import { migrateProjectDatabase, getProjectSchemaVersion } from "./migrations"
import type { RequirementRow, TraceabilityLinkRow, AuditTrailRow, AiGenerationRow, HumanDecisionRow } from "../types"

export class ProjectDatabase {
	private db: SqlJsDatabase
	private dbPath: string
	private projectRoot: string

	constructor(projectRoot: string) {
		this.projectRoot = projectRoot
		this.dbPath = path.join(projectRoot, ".aeriocode", "project.db")

		// Ensure .aeriocode directory exists
		const dir = path.dirname(this.dbPath)
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true })
		}

		// Initialize database (WASM must be pre-initialized via SqlJsDatabase.init())
		this.db = SqlJsDatabase.openSync(this.dbPath)
		migrateProjectDatabase(this.db)
	}

	getSchemaVersion(): number {
		return getProjectSchemaVersion(this.db)
	}

	// --- Requirements CRUD ---

	insertRequirement(req: {
		requirement_id: string
		level: string
		title: string
		description?: string
		dal_level?: string
		status?: string
		parent_requirement_id?: string
		source?: string
		rationale?: string
	}): number {
		const stmt = this.db.prepare(`
			INSERT INTO requirements (requirement_id, level, title, description, dal_level, status, parent_requirement_id, source, rationale)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		const result = stmt.run(
			req.requirement_id,
			req.level,
			req.title,
			req.description || null,
			req.dal_level || null,
			req.status || "active",
			req.parent_requirement_id || null,
			req.source || null,
			req.rationale || null,
		)
		return result.lastInsertRowid as number
	}

	getRequirement(requirementId: string): RequirementRow | undefined {
		return this.db.prepare("SELECT * FROM requirements WHERE requirement_id = ?").get(requirementId) as
			RequirementRow | undefined
	}

	getAllRequirements(): RequirementRow[] {
		return this.db
			.prepare("SELECT * FROM requirements WHERE status = ? ORDER BY requirement_id")
			.all("active") as RequirementRow[]
	}

	updateRequirement(
		requirementId: string,
		updates: Partial<Pick<RequirementRow, "title" | "description" | "dal_level" | "status" | "rationale">>,
	): void {
		const fields: string[] = []
		const values: unknown[] = []

		if (updates.title !== undefined) {
			fields.push("title = ?")
			values.push(updates.title)
		}
		if (updates.description !== undefined) {
			fields.push("description = ?")
			values.push(updates.description)
		}
		if (updates.dal_level !== undefined) {
			fields.push("dal_level = ?")
			values.push(updates.dal_level)
		}
		if (updates.status !== undefined) {
			fields.push("status = ?")
			values.push(updates.status)
		}
		if (updates.rationale !== undefined) {
			fields.push("rationale = ?")
			values.push(updates.rationale)
		}

		if (fields.length === 0) return

		fields.push("updated_at = datetime('now')")
		values.push(requirementId)

		this.db.prepare(`UPDATE requirements SET ${fields.join(", ")} WHERE requirement_id = ?`).run(...values)
	}

	// --- Traceability Links ---

	insertTraceLink(link: {
		requirement_id: string
		artifact_type: string
		artifact_path?: string
		artifact_line_start?: number
		artifact_line_end?: number
		artifact_content_hash?: string
		link_type: string
		confidence?: string
	}): number {
		const stmt = this.db.prepare(`
			INSERT INTO traceability_links (requirement_id, artifact_type, artifact_path, artifact_line_start, artifact_line_end, artifact_content_hash, link_type, confidence)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`)
		const result = stmt.run(
			link.requirement_id,
			link.artifact_type,
			link.artifact_path || null,
			link.artifact_line_start || null,
			link.artifact_line_end || null,
			link.artifact_content_hash || null,
			link.link_type,
			link.confidence || "auto",
		)
		return result.lastInsertRowid as number
	}

	getLinksForRequirement(requirementId: string): TraceabilityLinkRow[] {
		return this.db
			.prepare("SELECT * FROM traceability_links WHERE requirement_id = ? ORDER BY artifact_path")
			.all(requirementId) as TraceabilityLinkRow[]
	}

	getLinksForArtifact(artifactPath: string): TraceabilityLinkRow[] {
		return this.db
			.prepare("SELECT * FROM traceability_links WHERE artifact_path = ? ORDER BY requirement_id")
			.all(artifactPath) as TraceabilityLinkRow[]
	}

	getAllLinks(): TraceabilityLinkRow[] {
		return this.db
			.prepare("SELECT * FROM traceability_links ORDER BY requirement_id, artifact_path")
			.all() as TraceabilityLinkRow[]
	}

	deleteLink(linkId: number): void {
		this.db.prepare("DELETE FROM traceability_links WHERE id = ?").run(linkId)
	}

	getLinkCounts(): { traced: number; untraced: number } {
		const traced = (
			this.db.prepare("SELECT COUNT(DISTINCT artifact_path) as count FROM traceability_links").get() as { count: number }
		).count
		return { traced, untraced: 0 } // untraced is computed by TraceabilityChecker
	}

	// --- Audit Trail (read-only from ProjectDatabase, writes go through AuditTrailService) ---

	getAuditEntry(id: number): AuditTrailRow | undefined {
		return this.db.prepare("SELECT * FROM audit_trail WHERE id = ?").get(id) as AuditTrailRow | undefined
	}

	queryAuditEntries(
		filters: {
			event_type?: string
			user_id?: string
			start_date?: string
			end_date?: string
			limit?: number
			offset?: number
		} = {},
	): AuditTrailRow[] {
		const conditions: string[] = []
		const params: unknown[] = []

		if (filters.event_type) {
			conditions.push("event_type = ?")
			params.push(filters.event_type)
		}
		if (filters.user_id) {
			conditions.push("user_id = ?")
			params.push(filters.user_id)
		}
		if (filters.start_date) {
			conditions.push("timestamp >= ?")
			params.push(filters.start_date)
		}
		if (filters.end_date) {
			conditions.push("timestamp <= ?")
			params.push(filters.end_date)
		}

		const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
		const limit = filters.limit || 1000
		const offset = filters.offset || 0

		return this.db
			.prepare(`SELECT * FROM audit_trail ${where} ORDER BY id ASC LIMIT ? OFFSET ?`)
			.all(...params, limit, offset) as AuditTrailRow[]
	}

	getLastAuditEntry(): AuditTrailRow | undefined {
		return this.db.prepare("SELECT * FROM audit_trail ORDER BY id DESC LIMIT 1").get() as AuditTrailRow | undefined
	}

	getAuditCount(): number {
		return (this.db.prepare("SELECT COUNT(*) as count FROM audit_trail").get() as { count: number }).count
	}

	// --- AI Generations ---

	insertGeneration(gen: {
		generation_id: string
		user_id?: string
		session_id?: string
		task_id?: string
		model_id: string
		model_version?: string
		provider?: string
		user_message?: string
		user_message_hash?: string
		files_read?: string[]
		files_written?: string[]
		tool_calls?: string[]
		requirement_tags_found?: string[]
		started_at?: string
	}): number {
		const stmt = this.db.prepare(`
			INSERT INTO ai_generations (generation_id, user_id, session_id, task_id, model_id, model_version, provider, user_message, user_message_hash, files_read, files_written, tool_calls, requirement_tags_found, started_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		const result = stmt.run(
			gen.generation_id,
			gen.user_id || null,
			gen.session_id || null,
			gen.task_id || null,
			gen.model_id,
			gen.model_version || null,
			gen.provider || null,
			gen.user_message || null,
			gen.user_message_hash || null,
			JSON.stringify(gen.files_read || []),
			JSON.stringify(gen.files_written || []),
			JSON.stringify(gen.tool_calls || []),
			JSON.stringify(gen.requirement_tags_found || []),
			gen.started_at || new Date().toISOString(),
		)
		return result.lastInsertRowid as number
	}

	updateGenerationCompletion(
		generationId: string,
		data: {
			completed_at?: string
			duration_ms?: number
			files_written?: string[]
			audit_entry_id?: number
		},
	): void {
		const fields: string[] = []
		const values: unknown[] = []

		if (data.completed_at !== undefined) {
			fields.push("completed_at = ?")
			values.push(data.completed_at)
		}
		if (data.duration_ms !== undefined) {
			fields.push("duration_ms = ?")
			values.push(data.duration_ms)
		}
		if (data.files_written !== undefined) {
			fields.push("files_written = ?")
			values.push(JSON.stringify(data.files_written))
		}
		if (data.audit_entry_id !== undefined) {
			fields.push("audit_entry_id = ?")
			values.push(data.audit_entry_id)
		}

		if (fields.length === 0) return
		values.push(generationId)

		this.db.prepare(`UPDATE ai_generations SET ${fields.join(", ")} WHERE generation_id = ?`).run(...values)
	}

	getGeneration(generationId: string): AiGenerationRow | undefined {
		return this.db.prepare("SELECT * FROM ai_generations WHERE generation_id = ?").get(generationId) as
			AiGenerationRow | undefined
	}

	queryGenerations(
		filters: {
			user_id?: string
			start_date?: string
			end_date?: string
			limit?: number
			offset?: number
		} = {},
	): AiGenerationRow[] {
		const conditions: string[] = []
		const params: unknown[] = []

		if (filters.user_id) {
			conditions.push("user_id = ?")
			params.push(filters.user_id)
		}
		if (filters.start_date) {
			conditions.push("started_at >= ?")
			params.push(filters.start_date)
		}
		if (filters.end_date) {
			conditions.push("started_at <= ?")
			params.push(filters.end_date)
		}

		const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
		const limit = filters.limit || 1000
		const offset = filters.offset || 0

		return this.db
			.prepare(`SELECT * FROM ai_generations ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
			.all(...params, limit, offset) as AiGenerationRow[]
	}

	// --- Human Decisions ---

	insertDecision(dec: {
		decision_id: string
		generation_id?: string
		user_id: string
		decision: string
		files_affected?: string[]
		diff_summary?: string
		rationale?: string
		compliance_notes?: string
		presented_at?: string
		decided_at?: string
		decision_duration_ms?: number
		audit_entry_id?: number
	}): number {
		const stmt = this.db.prepare(`
			INSERT INTO human_decisions (decision_id, generation_id, user_id, decision, files_affected, diff_summary, rationale, compliance_notes, presented_at, decided_at, decision_duration_ms, audit_entry_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		const result = stmt.run(
			dec.decision_id,
			dec.generation_id || null,
			dec.user_id,
			dec.decision,
			JSON.stringify(dec.files_affected || []),
			dec.diff_summary || null,
			dec.rationale || null,
			dec.compliance_notes || null,
			dec.presented_at || null,
			dec.decided_at || null,
			dec.decision_duration_ms || null,
			dec.audit_entry_id || null,
		)
		return result.lastInsertRowid as number
	}

	getDecisionStats(): { total: number; accepted: number; modified: number; rejected: number; avgDecisionTimeMs: number } {
		const stats = this.db
			.prepare(
				`
			SELECT
				COUNT(*) as total,
				SUM(CASE WHEN decision = 'accepted' THEN 1 ELSE 0 END) as accepted,
				SUM(CASE WHEN decision = 'modified' THEN 1 ELSE 0 END) as modified,
				SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END) as rejected,
				AVG(decision_duration_ms) as avgDecisionTimeMs
			FROM human_decisions
		`,
			)
			.get() as { total: number; accepted: number; modified: number; rejected: number; avgDecisionTimeMs: number }

		return {
			total: stats.total || 0,
			accepted: stats.accepted || 0,
			modified: stats.modified || 0,
			rejected: stats.rejected || 0,
			avgDecisionTimeMs: Math.round(stats.avgDecisionTimeMs || 0),
		}
	}

	// --- Integrity Check ---

	insertIntegrityCheck(check: {
		check_type: string
		total_entries: number
		valid_entries: number
		invalid_entries: number
		details?: string
		passed: boolean
	}): number {
		const result = this.db
			.prepare(
				`
			INSERT INTO integrity_check (check_type, total_entries, valid_entries, invalid_entries, details, passed)
			VALUES (?, ?, ?, ?, ?, ?)
		`,
			)
			.run(
				check.check_type,
				check.total_entries,
				check.valid_entries,
				check.invalid_entries,
				check.details || null,
				check.passed ? 1 : 0,
			)
		return result.lastInsertRowid as number
	}

	// --- Transaction wrapper ---

	transaction<T>(fn: () => T): T {
		return this.db.transaction(fn)()
	}

	// --- Raw database access for AuditTrailService ---

	getRawDatabase(): SqlJsDatabase {
		return this.db
	}

	// --- Close ---

	close(): void {
		try {
			this.db.close()
		} catch {
			// Already closed or invalid
		}
	}
}
