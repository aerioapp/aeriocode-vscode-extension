import type { AuditTrailService } from "./AuditTrailService"
import type { ProjectDatabase } from "./db/ProjectDatabase"
import type { IntegrityResult } from "./types"

/**
 * IntegrityVerifier - Verify hash chain integrity and immutability of audit trail.
 * Records verification results in the integrity_check table.
 */
export class IntegrityVerifier {
	private auditService: AuditTrailService
	private db: ProjectDatabase

	constructor(auditService: AuditTrailService, db: ProjectDatabase) {
		this.auditService = auditService
		this.db = db
	}

	/**
	 * Run a full integrity check on the audit trail.
	 * Verifies the hash chain and records the result.
	 */
	verify(): IntegrityResult {
		const raw = this.auditService.verifyIntegrity()

		// Record the check result
		this.db.insertIntegrityCheck({
			check_type: "hash_chain",
			total_entries: raw.totalEntries,
			valid_entries: raw.valid ? raw.totalEntries : raw.brokenAt ? raw.brokenAt - 1 : 0,
			invalid_entries: raw.valid ? 0 : raw.brokenAt ? raw.totalEntries - raw.brokenAt + 1 : raw.totalEntries,
			passed: raw.valid,
		})

		// Map to IntegrityResult interface
		const result: IntegrityResult = {
			valid: raw.valid,
			total_entries: raw.totalEntries,
			broken_at: raw.brokenAt,
		}
		return result
	}

	/**
	 * Get the most recent integrity check result.
	 */
	getLastCheck(): { passed: boolean; checkedAt: string; totalEntries: number } | null {
		const db = this.db.getRawDatabase()
		const row = db.prepare("SELECT * FROM integrity_check ORDER BY id DESC LIMIT 1").get() as
			{ passed: number; check_at: string; total_entries: number } | undefined

		if (!row) return null

		return {
			passed: row.passed === 1,
			checkedAt: row.check_at,
			totalEntries: row.total_entries,
		}
	}

	/**
	 * Quick integrity check — just verifies the chain without recording.
	 * Useful for periodic lightweight checks.
	 */
	quickCheck(): boolean {
		const result = this.auditService.verifyIntegrity()
		return result.valid
	}
}
