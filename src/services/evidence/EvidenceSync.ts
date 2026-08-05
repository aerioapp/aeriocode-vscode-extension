import { randomUUID } from "crypto"
import type { ProjectDatabase } from "@/certification/db/ProjectDatabase"
import { Logger } from "@/services/logging/Logger"
import { EvidenceApiError, EvidenceClient, type EvidenceEntry } from "./EvidenceClient"

/**
 * Pushes the local audit trail to the server-side evidence store.
 *
 * The local database is a **write buffer**, not the system of record. Work continues offline
 * and nothing is lost, but the authoritative, chained, signed trail lives server-side where
 * the developer being audited cannot alter it. That is the whole point of the exercise: a
 * hash chain in a file its subject owns proves nothing.
 *
 * Three properties this has to get right, because getting them wrong corrupts evidence
 * rather than merely inconveniencing someone:
 *
 *   **Never lose an entry.** The cursor advances only for entries the server confirmed. A
 *   crash mid-push replays the batch, which is safe because every entry carries a stable
 *   `clientEntryId` and the server skips ones it already holds.
 *
 *   **Never reorder.** Entries go up in local `id` order, in one batch, and a failure stops
 *   the run rather than skipping ahead. An out-of-order trail would still verify server-side
 *   — the server assigns its own `seq` — but it would no longer reflect what happened.
 *
 *   **Never block the editor.** Sync failures are logged, never surfaced as errors and never
 *   thrown into a caller. Certification is an optional feature; it must not be able to break
 *   an ordinary coding session.
 */

/** Entries per request. The server caps a batch at 500; this leaves headroom. */
const BATCH_SIZE = 200

/**
 * Consecutive failures before this session stops trying.
 *
 * A permanent rejection — a payload the server will never accept — would otherwise be retried
 * on every flush forever, and every retry blocks the entries queued behind it. Stopping and
 * saying why in the log is more useful than an endless quiet loop.
 */
const MAX_CONSECUTIVE_FAILURES = 5

interface AuditRowForSync {
	id: number
	entry_hash: string
	event_type: string
	event_action: string
	user_id: string | null
	task_id: string | null
	entity_type: string | null
	entity_id: string | null
	timestamp: string
	payload: string
}

export class EvidenceSync {
	private readonly db: ProjectDatabase
	private readonly client: EvidenceClient

	private projectKey: string | null = null
	private projectRegistered = false
	private consecutiveFailures = 0
	private running = false
	/** Set when a flush is requested while one is already in progress. */
	private rerunRequested = false

	constructor(db: ProjectDatabase, client: EvidenceClient = EvidenceClient.getInstance()) {
		this.db = db
		this.client = client
	}

	/**
	 * The project's stable identity, minted once and reused.
	 *
	 * Deliberately not derived from the workspace path. A project checked out at a second
	 * location, or renamed, must continue the same trail rather than silently starting a
	 * parallel one — and two trails for one project is the kind of gap that only surfaces
	 * during an audit.
	 */
	private ensureProjectKey(): string | null {
		if (this.projectKey) {
			return this.projectKey
		}

		try {
			const raw = this.db.getRawDatabase()
			const existing = raw.prepare("SELECT project_key FROM evidence_sync WHERE id = 1").get() as
				{ project_key: string } | undefined

			if (existing?.project_key) {
				this.projectKey = existing.project_key
				return this.projectKey
			}

			const minted = randomUUID()
			raw.prepare("INSERT INTO evidence_sync (id, project_key) VALUES (1, ?)").run(minted)
			this.projectKey = minted
			return minted
		} catch (error) {
			// A missing evidence_sync table means the migration has not run. Not fatal — the
			// local trail is still being written, and sync resumes once the schema catches up.
			Logger.log("Evidence sync: could not establish project key: " + error)
			return null
		}
	}

	private cursor(): number {
		try {
			const row = this.db.getRawDatabase().prepare("SELECT last_synced_audit_id FROM evidence_sync WHERE id = 1").get() as
				{ last_synced_audit_id: number } | undefined
			return row?.last_synced_audit_id ?? 0
		} catch {
			return 0
		}
	}

	private pendingEntries(afterId: number): AuditRowForSync[] {
		return this.db
			.getRawDatabase()
			.prepare(
				`SELECT id, entry_hash, event_type, event_action, user_id, task_id, entity_type, entity_id, timestamp, payload
				 FROM audit_trail WHERE id > ? ORDER BY id ASC LIMIT ?`,
			)
			.all(afterId, BATCH_SIZE) as unknown as AuditRowForSync[]
	}

	/**
	 * How many entries are waiting. Surfaced so the UI can show a genuine backlog figure
	 * rather than implying everything is safely stored server-side when it is not.
	 */
	pendingCount(): number {
		try {
			const row = this.db
				.getRawDatabase()
				.prepare("SELECT COUNT(*) AS count FROM audit_trail WHERE id > ?")
				.get(this.cursor()) as { count: number } | undefined
			return row?.count ?? 0
		} catch {
			return 0
		}
	}

	private toEvidenceEntry(row: AuditRowForSync): EvidenceEntry {
		let payload: Record<string, unknown> = {}
		try {
			payload = row.payload ? JSON.parse(row.payload) : {}
		} catch {
			// A payload that will not parse is recorded as such rather than dropped: losing the
			// entry would leave a hole in the trail, and a hole is worse than a malformed record.
			payload = { unparseable_payload: true }
		}

		return {
			eventType: row.event_type,
			eventAction: row.event_action,
			userId: row.user_id ?? undefined,
			taskId: row.task_id ?? undefined,
			entityType: row.entity_type ?? undefined,
			entityId: row.entity_id ?? undefined,
			occurredAt: row.timestamp,
			payload,
			// The local row's hash doubles as its stable identity. It is already unique per
			// entry and already stored, so no extra column is needed to make a retry safe.
			clientEntryId: row.entry_hash,
			clientChainHash: row.entry_hash,
		}
	}

	private advanceCursor(lastId: number, pushed: number): void {
		this.db
			.getRawDatabase()
			.prepare(
				`UPDATE evidence_sync
				 SET last_synced_audit_id = ?, last_success_at = ?, last_error = NULL, entries_pushed = entries_pushed + ?
				 WHERE id = 1`,
			)
			.run(lastId, new Date().toISOString(), pushed)
	}

	private recordFailure(message: string): void {
		try {
			this.db
				.getRawDatabase()
				.prepare("UPDATE evidence_sync SET last_attempt_at = ?, last_error = ? WHERE id = 1")
				.run(new Date().toISOString(), message)
		} catch {
			// Recording the failure is best-effort; failing to record it must not itself throw.
		}
	}

	/**
	 * Push everything pending.
	 *
	 * Never throws. A caller is always some part of an ordinary editing flow — a file saved, a
	 * tool call finished — and evidence sync must not be able to interrupt it.
	 *
	 * Re-entrant calls collapse into one: a second flush while the first is in flight sets a
	 * flag and lets the running pass pick the work up, so a burst of events produces one drain
	 * rather than a pile of overlapping pushes competing for the same cursor.
	 */
	async flush(): Promise<{ pushed: number; skipped: number; stopped: boolean }> {
		if (this.running) {
			this.rerunRequested = true
			return { pushed: 0, skipped: 0, stopped: false }
		}
		if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
			return { pushed: 0, skipped: 0, stopped: true }
		}

		let pushed = 0
		let skipped = 0
		let stopped = false

		// A re-run requested mid-pass is handled by looping, not by recursing. Recursion grows the
		// stack once per burst of events, and a workspace busy enough to request a flush during every
		// flush would eventually overflow it — a crash in the editor caused by an optional feature.
		do {
			this.rerunRequested = false
			const pass = await this.runOnce()
			pushed += pass.pushed
			skipped += pass.skipped
			stopped = pass.stopped
		} while (this.rerunRequested && !stopped)

		return { pushed, skipped, stopped }
	}

	/** One drain pass. `flush` owns the re-run loop and the running flag. */
	private async runOnce(): Promise<{ pushed: number; skipped: number; stopped: boolean }> {
		this.running = true
		let pushed = 0
		let skipped = 0
		let stopped = false

		try {
			const projectKey = this.ensureProjectKey()
			if (!projectKey) {
				return { pushed: 0, skipped: 0, stopped: false }
			}

			if (!this.projectRegistered) {
				await this.client.ensureProject(projectKey)
				this.projectRegistered = true
			}

			// Loop until drained, so a long offline backlog clears in one pass rather than one
			// batch per triggering event.
			for (;;) {
				const rows = this.pendingEntries(this.cursor())
				if (rows.length === 0) {
					break
				}

				const result = await this.client.appendEntries(
					projectKey,
					rows.map((row) => this.toEvidenceEntry(row)),
				)

				// Every entry the server was sent has to come back accounted for, as appended or as
				// already held. Advancing the cursor past one it accounted for as neither would drop
				// it from the trail permanently — the one failure this class must not have, and one
				// that leaves no trace once the cursor has moved.
				const accounted = result.appended.length + result.skipped.length
				if (accounted !== rows.length) {
					throw new Error(
						`Evidence sync: the server accounted for ${accounted} of ${rows.length} entries in the batch. ` +
							`Not advancing the cursor — the unaccounted entries would be lost.`,
					)
				}

				// The cursor advances past the whole batch, including entries the server skipped
				// as already held: skipped means present, and re-sending them forever would
				// never drain the queue.
				this.advanceCursor(rows[rows.length - 1].id, result.appended.length)
				pushed += result.appended.length
				skipped += result.skipped.length
				this.consecutiveFailures = 0

				if (rows.length < BATCH_SIZE) {
					break
				}
			}
		} catch (error) {
			const apiError = error instanceof EvidenceApiError ? error : null
			const message = apiError?.message ?? String(error)

			this.recordFailure(message)

			if (apiError && !apiError.retryable) {
				// Permanent. Stop this session rather than retrying a batch the server will
				// never accept and blocking everything queued behind it.
				this.consecutiveFailures = MAX_CONSECUTIVE_FAILURES
				stopped = true
				Logger.log(`Evidence sync: permanent failure, not retrying this session — ${message}`)
			} else {
				this.consecutiveFailures++
				stopped = this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
				Logger.log(
					`Evidence sync: attempt ${this.consecutiveFailures} of ${MAX_CONSECUTIVE_FAILURES} failed — ${message}`,
				)
			}
		} finally {
			this.running = false
		}

		return { pushed, skipped, stopped }
	}

	/**
	 * Ask the server to verify the trail it holds.
	 *
	 * Verification is server-side because the client has no business attesting to a chain it
	 * did not build and cannot sign. Any pending backlog is pushed first, so a verification
	 * result describes the whole trail rather than the part that happened to have arrived.
	 */
	async verify(): Promise<{
		valid: boolean
		entriesChecked: number
		brokenAtSeq: number | null
		reason: string | null
		pendingLocally: number
	} | null> {
		const projectKey = this.ensureProjectKey()
		if (!projectKey) {
			return null
		}

		await this.flush()

		try {
			const result = await this.client.verifyChain(projectKey)
			return { ...result, pendingLocally: this.pendingCount() }
		} catch (error) {
			Logger.log("Evidence sync: verification failed — " + (error as Error).message)
			return null
		}
	}

	/** Sync status for the UI. */
	status(): { projectKey: string | null; pending: number; lastError: string | null; stopped: boolean } {
		let lastError: string | null = null
		try {
			const row = this.db.getRawDatabase().prepare("SELECT last_error FROM evidence_sync WHERE id = 1").get() as
				{ last_error: string | null } | undefined
			lastError = row?.last_error ?? null
		} catch {
			lastError = null
		}

		return {
			projectKey: this.projectKey,
			pending: this.pendingCount(),
			lastError,
			stopped: this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
		}
	}
}

export { BATCH_SIZE, MAX_CONSECUTIVE_FAILURES }
