import { describe, it, before, beforeEach, afterEach } from "mocha"
import { expect } from "chai"
import path from "path"
import fs from "fs"
import os from "os"
import { SqlJsDatabase } from "@/certification/db/SqlJsDatabase"
import { migrateProjectDatabase } from "@/certification/db/migrations"
import { EvidenceSync } from "../EvidenceSync"
import {
	EvidenceApiError,
	EvidenceClient,
	type AppendResult,
	type EvidenceEntry,
	type EvidenceTransport,
} from "../EvidenceClient"

/**
 * Evidence sync tests.
 *
 * The local database is a write buffer and the server holds the authoritative trail, so the
 * failure behaviour here is what decides whether evidence survives. These assert the three
 * properties that would corrupt a trail rather than merely inconvenience someone: entries are
 * never lost, never reordered, and a sync failure never propagates into the editing flow.
 */

/** Records what would have been sent, and can be told to fail. */
class StubTransport implements EvidenceTransport {
	readonly batches: EvidenceEntry[][] = []
	failWith: EvidenceApiError | null = null
	private seq = 0

	async post<T>(url: string, body: unknown): Promise<T> {
		if (url.endsWith("/projects")) {
			return { success: true, data: { project: { project_key: "k" } } } as T
		}

		if (this.failWith) {
			throw this.failWith
		}

		const entries = (body as { entries: EvidenceEntry[] }).entries
		this.batches.push(entries)

		const appended = entries.map((entry) => ({ seq: ++this.seq, entryHash: entry.clientEntryId ?? "", signed: true }))
		const result: AppendResult = { appended, skipped: [], tipSeq: this.seq, tipHash: "tip" }
		return { success: true, data: result } as T
	}

	async get<T>(): Promise<T> {
		return { success: true, data: {} } as T
	}

	/** Every entry across every batch, in the order sent. */
	sent(): EvidenceEntry[] {
		return this.batches.flat()
	}
}

describe("EvidenceSync", () => {
	let db: SqlJsDatabase
	let projectDb: any
	let tmpDir: string
	let transport: StubTransport
	let sync: EvidenceSync

	before(async () => {
		await SqlJsDatabase.init()
	})

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-sync-"))
		db = SqlJsDatabase.openSync(path.join(tmpDir, "test.db"))
		migrateProjectDatabase(db)

		projectDb = { getRawDatabase: () => db }
		transport = new StubTransport()
		sync = new EvidenceSync(projectDb, new EvidenceClient(transport, "http://backend.test", async () => "token"))
	})

	afterEach(() => {
		db.close()
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	/** Append entries straight into the local trail, as AuditTrailService would. */
	function seedEntries(count: number, eventType = "compliance_check") {
		for (let index = 1; index <= count; index++) {
			db.prepare(
				`INSERT INTO audit_trail (entry_hash, previous_hash, event_type, event_action, timestamp, payload)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			).run(
				`hash-${index}`,
				index === 1 ? null : `hash-${index - 1}`,
				eventType,
				"clean",
				`2026-07-29T10:00:0${index}.000Z`,
				JSON.stringify({ n: index }),
			)
		}
	}

	describe("the migration that makes this possible", () => {
		it("creates the sync cursor, because audit_trail cannot be marked in place", () => {
			// audit_trail carries UPDATE and DELETE triggers, so a synced_at column on it would
			// be unwritable. Weakening those triggers to allow it would trade the append-only
			// guarantee for bookkeeping convenience.
			const row = db.prepare("SELECT COUNT(*) AS count FROM evidence_sync").get() as any
			expect(row.count).to.equal(0)

			// A row has to exist for a FOR EACH ROW trigger to fire at all, so seed one before
			// asserting the table really is unwritable.
			seedEntries(1)
			expect(() => db.prepare("UPDATE audit_trail SET event_action = 'x' WHERE id = 1").run()).to.throw()
			expect(() => db.prepare("DELETE FROM audit_trail WHERE id = 1").run()).to.throw()
		})
	})

	describe("pushing", () => {
		it("sends pending entries and advances the cursor", async () => {
			seedEntries(3)

			const result = await sync.flush()

			expect(result.pushed).to.equal(3)
			expect(transport.sent()).to.have.length(3)
			expect(sync.pendingCount()).to.equal(0)
		})

		it("sends nothing on a second flush when nothing new was recorded", async () => {
			seedEntries(2)
			await sync.flush()
			await sync.flush()

			expect(transport.sent()).to.have.length(2)
		})

		it("preserves local order", async () => {
			// An out-of-order trail would still verify server-side — the server assigns its own
			// seq — but it would no longer reflect what actually happened.
			seedEntries(5)
			await sync.flush()

			expect(transport.sent().map((entry) => entry.clientEntryId)).to.deep.equal([
				"hash-1",
				"hash-2",
				"hash-3",
				"hash-4",
				"hash-5",
			])
		})

		it("carries a stable identity per entry so a retry is harmless", async () => {
			seedEntries(1)
			await sync.flush()

			expect(transport.sent()[0].clientEntryId).to.equal("hash-1")
		})

		it("mints a stable project key and reuses it", async () => {
			// Not derived from the workspace path: a project checked out elsewhere must continue
			// the same trail rather than starting a parallel one.
			seedEntries(1)
			await sync.flush()
			const first = sync.status().projectKey

			const second = new EvidenceSync(projectDb, new EvidenceClient(transport, "http://backend.test", async () => "token"))
			seedEntries(1)
			await second.flush()

			expect(first).to.be.a("string")
			expect(second.status().projectKey).to.equal(first)
		})

		it("passes the payload through as an object", async () => {
			seedEntries(1)
			await sync.flush()

			expect(transport.sent()[0].payload).to.deep.equal({ n: 1 })
		})

		it("keeps an entry whose payload will not parse rather than dropping it", async () => {
			// A hole in the trail is worse than a malformed record.
			db.prepare(
				`INSERT INTO audit_trail (entry_hash, event_type, event_action, timestamp, payload) VALUES (?, ?, ?, ?, ?)`,
			).run("hash-bad", "compliance_check", "clean", "2026-07-29T10:00:00.000Z", "{not json")

			await sync.flush()

			expect(transport.sent()).to.have.length(1)
			expect(transport.sent()[0].payload).to.deep.equal({ unparseable_payload: true })
		})
	})

	describe("failure never loses an entry", () => {
		it("leaves the cursor untouched when the push fails", async () => {
			seedEntries(3)
			transport.failWith = new EvidenceApiError("offline", undefined, true)

			await sync.flush()

			// Nothing was confirmed, so nothing is considered synced.
			expect(sync.pendingCount()).to.equal(3)
		})

		it("sends the same entries again once the failure clears", async () => {
			seedEntries(3)
			transport.failWith = new EvidenceApiError("offline", undefined, true)
			await sync.flush()

			transport.failWith = null
			const result = await sync.flush()

			expect(result.pushed).to.equal(3)
			expect(sync.pendingCount()).to.equal(0)
		})

		it("records the error for the UI rather than hiding it", async () => {
			// A user whose entries are all still queued locally has materially weaker evidence
			// than one whose trail is stored server-side.
			seedEntries(1)
			transport.failWith = new EvidenceApiError("connection refused", undefined, true)
			await sync.flush()

			const status = sync.status()
			expect(status.lastError).to.match(/connection refused/)
			expect(status.pending).to.equal(1)
		})

		it("never throws into the caller", async () => {
			// Callers are ordinary editing flows. Evidence sync must not be able to break one.
			seedEntries(1)
			transport.failWith = new EvidenceApiError("boom", 500, true)

			await sync.flush() // resolves rather than rejecting
		})

		it("stops retrying a permanently rejected batch", async () => {
			// A payload the server will never accept would otherwise be retried on every flush
			// forever, blocking every entry queued behind it.
			seedEntries(1)
			transport.failWith = new EvidenceApiError("payload rejected", 400, false)

			const first = await sync.flush()
			expect(first.stopped).to.be.true

			transport.failWith = null
			const second = await sync.flush()
			expect(second.pushed).to.equal(0)
			expect(second.stopped).to.be.true
		})

		it("gives up after repeated retryable failures", async () => {
			seedEntries(1)
			transport.failWith = new EvidenceApiError("timeout", undefined, true)

			let stopped = false
			for (let attempt = 0; attempt < 6; attempt++) {
				stopped = (await sync.flush()).stopped
			}

			expect(stopped).to.be.true
			// The entry is still pending — given up on for this session, never discarded.
			expect(sync.pendingCount()).to.equal(1)
		})
	})

	describe("backlog", () => {
		it("drains more than one batch in a single pass", async () => {
			// A long offline backlog should clear in one pass rather than one batch per
			// triggering event.
			seedEntries(450)

			const result = await sync.flush()

			expect(result.pushed).to.equal(450)
			expect(transport.batches.length).to.be.greaterThan(1)
			expect(sync.pendingCount()).to.equal(0)
		})

		it("reports the pending count before anything is pushed", async () => {
			seedEntries(7)
			expect(sync.pendingCount()).to.equal(7)
		})
	})
})
