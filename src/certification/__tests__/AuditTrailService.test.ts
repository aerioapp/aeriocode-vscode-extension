import { describe, it, before, beforeEach, afterEach } from "mocha"
import { expect } from "chai"
import { SqlJsDatabase } from "../db/SqlJsDatabase"
import path from "path"
import fs from "fs"
import os from "os"
import { AuditTrailService } from "../AuditTrailService"
import { migrateProjectDatabase } from "../db/migrations"
import { ProjectDatabase } from "../db/ProjectDatabase"

describe("AuditTrailService", () => {
	let db: SqlJsDatabase
	let projectDb: ProjectDatabase
	let auditService: AuditTrailService
	let tmpDir: string

	before(async () => {
		await SqlJsDatabase.init()
	})

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cert-test-"))
		// Create a fresh in-memory-like DB (file-based for temp)
		db = SqlJsDatabase.openSync(path.join(tmpDir, "test.db"))
		migrateProjectDatabase(db)
		// Create a minimal ProjectDatabase wrapper with all methods AuditTrailService needs
		projectDb = {
			getRawDatabase: () => db,
			getLastAuditEntry: () => db.prepare("SELECT * FROM audit_trail ORDER BY id DESC LIMIT 1").get() || null,
			queryAuditEntries: (filters: any) => {
				const conditions: string[] = []
				const params: any[] = []
				if (filters.event_type) {
					conditions.push("event_type = ?")
					params.push(filters.event_type)
				}
				if (filters.limit) {
					params.push(filters.limit)
				} else {
					params.push(1000)
				}
				if (filters.offset) {
					params.push(filters.offset)
				} else {
					params.push(0)
				}
				const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
				return db.prepare(`SELECT * FROM audit_trail ${where} ORDER BY id ASC LIMIT ? OFFSET ?`).all(...params)
			},
			getDecisionStats: () => {
				// Query audit_trail for human_decision events (not human_decisions table)
				const stats = db
					.prepare(
						`
					SELECT
						COUNT(*) as total,
						SUM(CASE WHEN event_action = 'accepted' THEN 1 ELSE 0 END) as accepted,
						SUM(CASE WHEN event_action = 'modified' THEN 1 ELSE 0 END) as modified,
						SUM(CASE WHEN event_action = 'rejected' THEN 1 ELSE 0 END) as rejected
					FROM audit_trail
					WHERE event_type = 'human_decision'
				`,
					)
					.get() as any
				return {
					total: stats.total || 0,
					accepted: stats.accepted || 0,
					modified: stats.modified || 0,
					rejected: stats.rejected || 0,
					avgDecisionTimeMs: 0,
				}
			},
		} as any
		auditService = new AuditTrailService(projectDb)
	})

	afterEach(() => {
		db.close()
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	describe("recordEvent()", () => {
		it("should insert an audit entry with hash chain", async () => {
			const entryId = await auditService.recordEvent({
				event_type: "ai_generation",
				event_action: "started",
				entity_type: "ai_suggestion",
				entity_id: "gen-001",
				payload: { test: true },
			})

			expect(entryId).to.be.a("number")
			expect(entryId).to.be.greaterThan(0)
		})

		it("should chain hashes across multiple entries", async () => {
			const id1 = await auditService.recordEvent({
				event_type: "ai_generation",
				event_action: "started",
				entity_type: "ai_suggestion",
				entity_id: "gen-001",
				payload: { test: 1 },
			})

			const id2 = await auditService.recordEvent({
				event_type: "ai_generation",
				event_action: "completed",
				entity_type: "ai_suggestion",
				entity_id: "gen-001",
				payload: { test: 2 },
			})

			const entry1 = db.prepare("SELECT * FROM audit_trail WHERE id = ?").get(id1) as any
			const entry2 = db.prepare("SELECT * FROM audit_trail WHERE id = ?").get(id2) as any

			expect(entry1.previous_hash).to.be.null // First entry has no previous hash
			expect(entry2.previous_hash).to.equal(entry1.entry_hash) // Chain links
			expect(entry2.entry_hash).to.not.equal(entry1.entry_hash) // Different hashes
		})

		it("should store event_type and entity_id correctly", async () => {
			const id = await auditService.recordEvent({
				event_type: "human_decision",
				event_action: "accepted",
				entity_type: "ai_suggestion",
				entity_id: "gen-002",
				user_id: "test-user",
				payload: { decision: "accepted" },
			})

			const entry = db.prepare("SELECT * FROM audit_trail WHERE id = ?").get(id) as any
			expect(entry.event_type).to.equal("human_decision")
			expect(entry.event_action).to.equal("accepted")
			expect(entry.entity_id).to.equal("gen-002")
			expect(entry.user_id).to.equal("test-user")
		})
	})

	describe("verifyIntegrity()", () => {
		it("should return valid for clean chain", async () => {
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

			const result = auditService.verifyIntegrity()
			expect(result.valid).to.be.true
			expect(result.totalEntries).to.equal(2)
			expect(result.brokenAt).to.be.null
		})

		it("should return empty result for empty trail", async () => {
			const result = await auditService.verifyIntegrity()
			expect(result.valid).to.be.true
			expect(result.totalEntries).to.equal(0)
		})
	})

	describe("queryEvents()", () => {
		it("should filter by event_type", async () => {
			await auditService.recordEvent({
				event_type: "ai_generation",
				event_action: "started",
				entity_type: "test",
				entity_id: "1",
				payload: {},
			})
			await auditService.recordEvent({
				event_type: "human_decision",
				event_action: "accepted",
				entity_type: "test",
				entity_id: "2",
				payload: {},
			})

			const results = auditService.queryEvents({ event_type: "ai_generation" })
			expect(results).to.have.lengthOf(1)
			expect(results[0].event_type).to.equal("ai_generation")
		})

		it("should respect limit parameter", async () => {
			for (let i = 0; i < 5; i++) {
				await auditService.recordEvent({
					event_type: "test",
					event_action: "action",
					entity_type: "test",
					entity_id: String(i),
					payload: {},
				})
			}

			const results = auditService.queryEvents({ limit: 3 })
			expect(results).to.have.lengthOf(3)
		})
	})

	describe("getDecisionStats()", () => {
		it("should return correct decision statistics", async () => {
			await auditService.recordEvent({
				event_type: "human_decision",
				event_action: "accepted",
				entity_type: "test",
				entity_id: "1",
				payload: {},
			})
			await auditService.recordEvent({
				event_type: "human_decision",
				event_action: "accepted",
				entity_type: "test",
				entity_id: "2",
				payload: {},
			})
			await auditService.recordEvent({
				event_type: "human_decision",
				event_action: "rejected",
				entity_type: "test",
				entity_id: "3",
				payload: {},
			})

			const stats = auditService.getDecisionStats()
			expect(stats.total).to.equal(3)
			expect(stats.accepted).to.equal(2)
			expect(stats.rejected).to.equal(1)
		})
	})
})
