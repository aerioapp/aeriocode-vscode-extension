import * as crypto from "crypto"
import type { ProjectDatabase } from "./db/ProjectDatabase"
import type { AuditEventParams, AuditTrailRow } from "./types"

/**
 * AuditTrailService - Append-only audit writes with hash chain.
 * Every entry is SHA-256 hashed and chained to the previous entry.
 * SQLite triggers prevent UPDATE/DELETE on the audit_trail table.
 */
export class AuditTrailService {
	private db: ProjectDatabase
	private lastHash: string | null = null

	constructor(db: ProjectDatabase) {
		this.db = db
		this.loadLastHash()
	}

	/**
	 * Load the hash of the most recent audit entry for chain continuity.
	 */
	private loadLastHash(): void {
		const last = this.db.getLastAuditEntry()
		this.lastHash = last?.entry_hash || null
	}

	/**
	 * Append a new audit entry. Never updates existing entries.
	 * Returns the inserted row ID.
	 */
	async recordEvent(params: AuditEventParams): Promise<number> {
		const timestamp = new Date().toISOString()
		const payloadJson = JSON.stringify(params.payload)

		// Compute hash: SHA-256(previous_hash + event_type + event_action + timestamp + payload)
		const prevHash: string = this.lastHash || ""
		const hashInput: string = `${prevHash}${params.event_type}${params.event_action}${timestamp}${payloadJson}`
		const entryHash: string = crypto.createHash("sha256").update(hashInput).digest("hex")

		const db = this.db.getRawDatabase()
		const result = db
			.prepare(
				`
			INSERT INTO audit_trail (
				entry_hash, previous_hash, event_type, event_action,
				user_id, session_id, task_id, timestamp,
				entity_type, entity_id, model_id, model_version,
				profile_id, payload
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
			)
			.run(
				entryHash,
				this.lastHash,
				params.event_type,
				params.event_action,
				params.user_id || null,
				params.session_id || null,
				params.task_id || null,
				timestamp,
				params.entity_type || null,
				params.entity_id || null,
				params.model_id || null,
				params.model_version || null,
				params.profile_id || null,
				payloadJson,
			)

		this.lastHash = entryHash
		return result.lastInsertRowid as number
	}

	/**
	 * Verify hash chain integrity.
	 * Returns whether the chain is valid, total entries, and where it broke.
	 */
	verifyIntegrity(): { valid: boolean; totalEntries: number; brokenAt: number | null } {
		const db = this.db.getRawDatabase()
		const entries = db
			.prepare(
				"SELECT id, entry_hash, previous_hash, event_type, event_action, timestamp, payload FROM audit_trail ORDER BY id ASC",
			)
			.all() as Array<{
			id: number
			entry_hash: string
			previous_hash: string | null
			event_type: string
			event_action: string
			timestamp: string
			payload: string
		}>

		let chainHash: string | null = null
		for (const entry of entries) {
			const prevHash: string = chainHash || ""
			const hashInput: string = `${prevHash}${entry.event_type}${entry.event_action}${entry.timestamp}${entry.payload}`
			const expectedHash: string = crypto.createHash("sha256").update(hashInput).digest("hex")

			if (entry.entry_hash !== expectedHash) {
				return { valid: false, totalEntries: entries.length, brokenAt: entry.id }
			}
			chainHash = entry.entry_hash
		}

		return { valid: true, totalEntries: entries.length, brokenAt: null }
	}

	/**
	 * Query audit trail with filters.
	 */
	queryEvents(
		filters: {
			event_type?: string
			user_id?: string
			start_date?: string
			end_date?: string
			limit?: number
			offset?: number
		} = {},
	): AuditTrailRow[] {
		return this.db.queryAuditEntries(filters)
	}

	/**
	 * Export audit trail as CSV string.
	 */
	exportCSV(filters?: { start_date?: string; end_date?: string }): string {
		const entries = this.queryEvents({
			start_date: filters?.start_date,
			end_date: filters?.end_date,
			limit: 100000,
		})

		const headers = [
			"id",
			"entry_hash",
			"previous_hash",
			"event_type",
			"event_action",
			"user_id",
			"session_id",
			"task_id",
			"timestamp",
			"entity_type",
			"entity_id",
			"model_id",
			"model_version",
			"profile_id",
			"payload",
		]

		const csvRows = [headers.join(",")]

		for (const entry of entries) {
			const row = headers.map((h) => {
				const val = entry[h as keyof AuditTrailRow]
				if (val === null || val === undefined) return ""
				const str = String(val)
				// Escape CSV: wrap in quotes if contains comma, quote, or newline
				if (str.includes(",") || str.includes('"') || str.includes("\n")) {
					return `"${str.replace(/"/g, '""')}"`
				}
				return str
			})
			csvRows.push(row.join(","))
		}

		return csvRows.join("\n")
	}

	/**
	 * Get decision statistics from the audit trail.
	 */
	getDecisionStats(): {
		total: number
		accepted: number
		modified: number
		rejected: number
		avgDecisionTimeMs: number
	} {
		return this.db.getDecisionStats()
	}

	/**
	 * Record a system event (e.g., chain gap recovery, integrity check).
	 */
	async recordSystemEvent(action: string, details: Record<string, unknown>): Promise<number> {
		return this.recordEvent({
			event_type: "system_event",
			event_action: action,
			entity_type: "system",
			payload: details,
		})
	}
}
