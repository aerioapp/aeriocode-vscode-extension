import { describe, it, before, beforeEach, afterEach } from "mocha"
import { expect } from "chai"
import { SqlJsDatabase } from "../db/SqlJsDatabase"
import path from "path"
import fs from "fs"
import os from "os"
import { IntegrityVerifier } from "../IntegrityVerifier"
import { AuditTrailService } from "../AuditTrailService"
import { migrateProjectDatabase } from "../db/migrations"
import { ProjectDatabase } from "../db/ProjectDatabase"

describe("IntegrityVerifier", () => {
	let db: SqlJsDatabase
	let projectDb: ProjectDatabase
	let auditService: AuditTrailService
	let verifier: IntegrityVerifier
	let tmpDir: string

	before(async () => {
		await SqlJsDatabase.init()
	})

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "integrity-test-"))
		db = SqlJsDatabase.openSync(path.join(tmpDir, "test.db"))
		migrateProjectDatabase(db)
		projectDb = {
			getRawDatabase: () => db,
			getLastAuditEntry: () => db.prepare("SELECT * FROM audit_trail ORDER BY id DESC LIMIT 1").get() || null,
			queryAuditEntries: () => [],
			getDecisionStats: () => ({ total: 0, accepted: 0, modified: 0, rejected: 0, avgDecisionTimeMs: 0 }),
			insertIntegrityCheck: (check: any) => {
				const result = db
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
			},
		} as any
		auditService = new AuditTrailService(projectDb)
		verifier = new IntegrityVerifier(auditService, projectDb)
	})

	afterEach(() => {
		db.close()
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	describe("verify()", () => {
		it("should return passed for a clean audit trail", async () => {
			await auditService.recordEvent({
				event_type: "test",
				event_action: "action1",
				entity_type: "test",
				entity_id: "1",
				payload: {},
			})
			await auditService.recordEvent({
				event_type: "test",
				event_action: "action2",
				entity_type: "test",
				entity_id: "2",
				payload: {},
			})

			const result = verifier.verify()
			expect(result.valid).to.be.true
			expect(result.total_entries).to.equal(2)
		})

		it("should record verification result in database", async () => {
			await auditService.recordEvent({
				event_type: "test",
				event_action: "action",
				entity_type: "test",
				entity_id: "1",
				payload: {},
			})

			verifier.verify()

			const row = db.prepare("SELECT * FROM integrity_check ORDER BY id DESC LIMIT 1").get() as any
			expect(row).to.not.be.undefined
			expect(row.passed).to.equal(1)
		})
	})

	describe("getLastCheck()", () => {
		it("should return null when no checks have been run", () => {
			const result = verifier.getLastCheck()
			expect(result).to.be.null
		})

		it("should return the most recent check", async () => {
			await auditService.recordEvent({
				event_type: "test",
				event_action: "action",
				entity_type: "test",
				entity_id: "1",
				payload: {},
			})

			verifier.verify()
			const last = verifier.getLastCheck()
			expect(last).to.not.be.null
			expect(last!.passed).to.be.true
		})
	})

	describe("quickCheck()", () => {
		it("should verify without recording to database", async () => {
			await auditService.recordEvent({
				event_type: "test",
				event_action: "action",
				entity_type: "test",
				entity_id: "1",
				payload: {},
			})

			const result = verifier.quickCheck()
			expect(result).to.be.true

			// Should NOT be recorded in the database
			const count = db.prepare("SELECT COUNT(*) as count FROM integrity_check").get() as any
			expect(count.count).to.equal(0)
		})
	})
})
