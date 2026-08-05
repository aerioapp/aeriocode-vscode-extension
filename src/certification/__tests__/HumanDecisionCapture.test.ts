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

	/**
	 * A compliance autofix is deterministic tool output, not something a model produced.
	 * It still needs a decision record — an engineer accepted machine-written edits into
	 * certified source — but it must not be filed as an AI generation, because the
	 * AI-provenance data is what a certification authority examines most closely.
	 */
	describe("decisions on changes that did not come from a generation", () => {
		it("records a decision with no generation and does not invent one", async () => {
			await decisionCapture.captureDecision({
				user_id: "user-1",
				decision: "accepted",
				subject_type: "compliance_autofix",
				subject_id: "jf-avpp",
				files_affected: ["src/flight_control.cpp"],
				compliance_notes: "Applied 4 safe-tier JF-AV++ fix(es)",
			})

			const row = db.prepare("SELECT * FROM human_decisions ORDER BY id DESC LIMIT 1").get() as any
			expect(row.decision).to.equal("accepted")
			expect(row.generation_id).to.be.null
			expect(row.compliance_notes).to.include("safe-tier")

			// The three seeded generations are still the only ones present.
			const generations = db.prepare("SELECT COUNT(*) AS count FROM ai_generations").get() as any
			expect(generations.count).to.equal(3)
		})

		it("files the audit entry against the autofix, not against an AI suggestion", async () => {
			await decisionCapture.captureDecision({
				user_id: "user-1",
				decision: "accepted",
				subject_type: "compliance_autofix",
				subject_id: "jf-avpp",
			})

			const entry = db.prepare("SELECT * FROM audit_trail ORDER BY id DESC LIMIT 1").get() as any
			expect(entry.entity_type).to.equal("compliance_autofix")
			expect(entry.entity_id).to.equal("jf-avpp")
			// No model produced this change, so no model may be attributed to it.
			expect(entry.model_id).to.be.null
			expect(JSON.parse(entry.payload).generation_id).to.be.null
		})

		it("still attributes a generation-backed decision to its model", async () => {
			await decisionCapture.captureDecision({
				generation_id: "gen-002",
				user_id: "user-1",
				decision: "accepted",
			})

			const entry = db.prepare("SELECT * FROM audit_trail ORDER BY id DESC LIMIT 1").get() as any
			expect(entry.entity_type).to.equal("ai_suggestion")
			expect(entry.entity_id).to.equal("gen-002")
			expect(entry.model_id).to.equal("test-model")
		})
	})
})
