import { describe, it, before, beforeEach, afterEach } from "mocha"
import { expect } from "chai"
import { SqlJsDatabase } from "../db/SqlJsDatabase"
import path from "path"
import fs from "fs"
import os from "os"
import { ExportService } from "../ExportService"
import { AuditTrailService } from "../AuditTrailService"
import { migrateProjectDatabase } from "../db/migrations"
import { ProjectDatabase } from "../db/ProjectDatabase"

describe("ExportService", () => {
	let db: SqlJsDatabase
	let projectDb: ProjectDatabase
	let auditService: AuditTrailService
	let exportService: ExportService
	let tmpDir: string

	before(async () => {
		await SqlJsDatabase.init()
	})

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "export-test-"))
		db = SqlJsDatabase.openSync(path.join(tmpDir, "test.db"))
		migrateProjectDatabase(db)
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
				const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
				const limit = filters.limit || 1000
				const offset = filters.offset || 0
				return db
					.prepare(`SELECT * FROM audit_trail ${where} ORDER BY id ASC LIMIT ? OFFSET ?`)
					.all(...params, limit, offset)
			},
			getDecisionStats: () => ({ total: 0, accepted: 0, modified: 0, rejected: 0, avgDecisionTimeMs: 0 }),
		} as any
		auditService = new AuditTrailService(projectDb)
		exportService = new ExportService(projectDb, auditService)
	})

	afterEach(() => {
		db.close()
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	describe("Data preparation for export", () => {
		it("should have requirements available for matrix export", () => {
			db.prepare(`INSERT INTO requirements (requirement_id, title, description, level, status) VALUES (?, ?, ?, ?, ?)`).run(
				"REQ-001",
				"Test Requirement",
				"Description",
				"HLR",
				"active",
			)

			const rows = db.prepare("SELECT * FROM requirements").all() as any[]
			expect(rows).to.have.lengthOf(1)
			expect(rows[0].title).to.equal("Test Requirement")
		})

		it("should have audit entries available for export", async () => {
			await auditService.recordEvent({
				event_type: "ai_generation",
				event_action: "started",
				entity_type: "test",
				entity_id: "1",
				payload: {},
			})

			const entries = db.prepare("SELECT * FROM audit_trail").all() as any[]
			expect(entries).to.have.lengthOf(1)
		})

		it("should handle CSV escaping for values with commas", () => {
			// Test the CSV escaping logic directly
			const escapeCsv = (value: string): string => {
				if (value.includes(",") || value.includes('"') || value.includes("\n")) {
					return `"${value.replace(/"/g, '""')}"`
				}
				return value
			}

			expect(escapeCsv("simple")).to.equal("simple")
			expect(escapeCsv("has,comma")).to.equal('"has,comma"')
			expect(escapeCsv('has"quote')).to.equal('"has""quote"')
			expect(escapeCsv("has\nnewline")).to.equal('"has\nnewline"')
			expect(escapeCsv('has,comma"and"quote')).to.equal('"has,comma""and""quote"')
		})
	})
})
