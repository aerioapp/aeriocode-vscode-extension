import { describe, it, before, beforeEach, afterEach } from "mocha"
import { expect } from "chai"
import { SqlJsDatabase } from "../db/SqlJsDatabase"
import path from "path"
import fs from "fs"
import os from "os"
import { HumanDecisionCapture } from "../HumanDecisionCapture"
import { AuditTrailService } from "../AuditTrailService"
import { migrateProjectDatabase } from "../db/migrations"
import { ProjectDatabase } from "../db/ProjectDatabase"

describe("HumanDecisionCapture", () => {
	let db: SqlJsDatabase
	let projectDb: ProjectDatabase
	let auditService: AuditTrailService
	let decisionCapture: HumanDecisionCapture
	let tmpDir: string

	before(async () => {
		await SqlJsDatabase.init()
	})

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decision-test-"))
		db = SqlJsDatabase.openSync(path.join(tmpDir, "test.db"))
		migrateProjectDatabase(db)

		// Create a generation record for foreign key
		db.prepare(`INSERT INTO ai_generations (generation_id, model_id, started_at) VALUES (?, ?, ?)`).run(
			"gen-001",
			"test-model",
			new Date().toISOString(),
		)
		db.prepare(`INSERT INTO ai_generations (generation_id, model_id, started_at) VALUES (?, ?, ?)`).run(
			"gen-002",
			"test-model",
			new Date().toISOString(),
		)
		db.prepare(`INSERT INTO ai_generations (generation_id, model_id, started_at) VALUES (?, ?, ?)`).run(
			"gen-003",
			"test-model",
			new Date().toISOString(),
		)

		projectDb = {
			getRawDatabase: () => db,
			getLastAuditEntry: () => db.prepare("SELECT * FROM audit_trail ORDER BY id DESC LIMIT 1").get() || null,
			queryAuditEntries: () => [],
			getDecisionStats: () => ({ total: 0, accepted: 0, modified: 0, rejected: 0, avgDecisionTimeMs: 0 }),
			getGeneration: (id: string) => db.prepare("SELECT * FROM ai_generations WHERE generation_id = ?").get(id) as any,
			insertDecision: (dec: any) => {
				const result = db
					.prepare(
						`
					INSERT INTO human_decisions (decision_id, generation_id, user_id, decision, files_affected, diff_summary, rationale, compliance_notes, presented_at, decided_at, decision_duration_ms, audit_entry_id)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
					)
					.run(
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
			},
		} as any
		auditService = new AuditTrailService(projectDb)
		decisionCapture = new HumanDecisionCapture(auditService, projectDb)
	})

	afterEach(() => {
		db.close()
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	describe("captureDecision()", () => {
		it("should insert a decision record into the database", async () => {
			await decisionCapture.captureDecision({
				generation_id: "gen-001",
				user_id: "test-user",
				decision: "accepted",
			})

			const rows = db.prepare("SELECT * FROM human_decisions WHERE generation_id = 'gen-001'").all() as any[]
			expect(rows).to.have.lengthOf(1)
			expect(rows[0].user_id).to.equal("test-user")
			expect(rows[0].decision).to.equal("accepted")
		})

		it("should store rationale when provided", async () => {
			await decisionCapture.captureDecision({
				generation_id: "gen-002",
				user_id: "test-user",
				decision: "rejected",
				rationale: "Does not meet safety requirements",
			})

			const row = db.prepare("SELECT * FROM human_decisions WHERE generation_id = 'gen-002'").get() as any
			expect(row.rationale).to.equal("Does not meet safety requirements")
		})

		it("should store files_affected when provided", async () => {
			await decisionCapture.captureDecision({
				generation_id: "gen-003",
				user_id: "test-user",
				decision: "modified",
				files_affected: ["src/main.c", "src/utils.c"],
			})

			const row = db.prepare("SELECT * FROM human_decisions WHERE generation_id = 'gen-003'").get() as any
			expect(row.files_affected).to.equal(JSON.stringify(["src/main.c", "src/utils.c"]))
		})
	})

	describe("captureAccepted()", () => {
		it("should record an accepted decision", async () => {
			await decisionCapture.captureAccepted("gen-001", "user-1")
			const row = db.prepare("SELECT * FROM human_decisions WHERE generation_id = 'gen-001'").get() as any
			expect(row.decision).to.equal("accepted")
		})
	})

	describe("captureRejected()", () => {
		it("should record a rejected decision with rationale", async () => {
			await decisionCapture.captureRejected("gen-001", "user-1", "Not safe")
			const row = db.prepare("SELECT * FROM human_decisions WHERE generation_id = 'gen-001'").get() as any
			expect(row.decision).to.equal("rejected")
			expect(row.rationale).to.equal("Not safe")
		})
	})

	describe("captureModified()", () => {
		it("should record a modified decision with summary", async () => {
			await decisionCapture.captureModified("gen-001", "user-1", "Changed error handling", "Added null checks")
			const row = db.prepare("SELECT * FROM human_decisions WHERE generation_id = 'gen-001'").get() as any
			expect(row.decision).to.equal("modified")
			expect(row.diff_summary).to.equal("Changed error handling")
			expect(row.rationale).to.equal("Added null checks")
		})
	})
})
