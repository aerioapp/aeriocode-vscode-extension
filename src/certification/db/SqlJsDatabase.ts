/// <reference path="./sql.js.d.ts" />
import initSqlJs, { type SqlJsStatic, type SqlJsDatabase as SqlJsDb } from "sql.js"
import * as fs from "fs"
import * as path from "path"
import { Logger } from "@/services/logging/Logger"

/**
 * Wrapper around sql.js that provides a better-sqlite3-compatible API.
 * Eliminates native compilation requirements (no .node files).
 *
 * Persistence: loads DB file from disk on init, exports to disk after writes.
 * Fully synchronous after initial async WASM load.
 */

export class Statement {
	private db: SqlJsDb
	private sql: string
	private onAfterWrite: () => void

	constructor(db: SqlJsDb, sql: string, onAfterWrite: () => void) {
		this.db = db
		this.sql = sql
		this.onAfterWrite = onAfterWrite
	}

	run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
		const bindings = params.length === 1 && Array.isArray(params[0]) ? params[0] : params
		const normalized = bindings.map((v) => (v === undefined ? null : v))
		this.db.run(this.sql, normalized as any[])
		const changes = this.db.getRowsModified()
		let lastInsertRowid = 0
		try {
			const result = this.db.exec("SELECT last_insert_rowid() as id")
			if (result.length > 0 && result[0].values.length > 0) {
				lastInsertRowid = Number(result[0].values[0][0])
			}
		} catch {
			// Statement may not have inserted anything
		}
		// Persist to disk immediately — sql.js keeps data in memory only
		this.onAfterWrite()
		return { changes, lastInsertRowid }
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	get(...params: unknown[]): any {
		const bindings = params.length === 1 && Array.isArray(params[0]) ? params[0] : params
		const normalized = bindings.map((v) => (v === undefined ? null : v))
		const results = this.db.exec(this.sql, normalized as any[])
		if (results.length === 0 || results[0].values.length === 0) {
			return undefined
		}
		const columns = results[0].columns
		const values = results[0].values[0]
		const row: Record<string, unknown> = {}
		for (let i = 0; i < columns.length; i++) {
			row[columns[i]] = values[i]
		}
		return row
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	all(...params: unknown[]): any[] {
		const bindings = params.length === 1 && Array.isArray(params[0]) ? params[0] : params
		const normalized = bindings.map((v) => (v === undefined ? null : v))
		const results = this.db.exec(this.sql, normalized as any[])
		if (results.length === 0) {
			return []
		}
		const columns = results[0].columns
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return results[0].values.map((rowValues: unknown[]) => {
			const row: Record<string, unknown> = {}
			for (let i = 0; i < columns.length; i++) {
				row[columns[i]] = rowValues[i]
			}
			return row
		})
	}

	iterate(params?: unknown[]): IterableIterator<Record<string, unknown>> {
		const rows = params !== undefined ? this.all(params) : this.all()
		return rows[Symbol.iterator]()
	}
}

export class SqlJsDatabase {
	private db: SqlJsDb
	private dbPath: string | null
	private dirty = false
	private inTransaction = false
	private static initPromise: Promise<SqlJsStatic> | null = null

	private static async getSqlJs(): Promise<SqlJsStatic> {
		if (!SqlJsDatabase.initPromise) {
			SqlJsDatabase.initPromise = initSqlJs({
				locateFile: (file: string) => {
					// Try multiple locations: production bundle (dist/), test (ts-node from src/), and project root
					const candidates = [
						path.join(__dirname, "..", "node_modules", "sql.js", "dist", file), // dist/ bundle
						path.join(__dirname, "..", "..", "..", "node_modules", "sql.js", "dist", file), // src/certification/db/ → project root
						path.join(process.cwd(), "node_modules", "sql.js", "dist", file), // cwd fallback
					]
					for (const candidate of candidates) {
						try {
							if (require("fs").existsSync(candidate)) return candidate
						} catch {
							/* ignore */
						}
					}
					return candidates[0] // fallback to first candidate
				},
			})
		}
		return SqlJsDatabase.initPromise
	}

	static async open(dbPath: string): Promise<SqlJsDatabase> {
		const sqlJs = await SqlJsDatabase.getSqlJs()

		let data: Buffer | null = null
		const dir = path.dirname(dbPath)
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true })
		}
		if (fs.existsSync(dbPath)) {
			data = fs.readFileSync(dbPath)
		}

		const db = data ? new sqlJs.Database(data) : new sqlJs.Database()
		return new SqlJsDatabase(db, dbPath)
	}

	private constructor(db: SqlJsDb, dbPath: string | null) {
		this.db = db
		this.dbPath = dbPath

		// Apply pragmas (best-effort, some like WAL have no effect in sql.js)
		try {
			this.db.run("PRAGMA foreign_keys = ON")
		} catch {
			/* ignore */
		}
	}

	/**
	 * Synchronous constructor for test/initialization contexts where async is not available.
	 * The caller MUST have called SqlJsDatabase.init() first.
	 */
	static openSync(dbPath: string): SqlJsDatabase {
		const sqlJs = SqlJsDatabase._sqlJsSync
		if (!sqlJs) {
			throw new Error("SqlJsDatabase.init() must be called before openSync()")
		}

		let data: Buffer | null = null
		const dir = path.dirname(dbPath)
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true })
		}
		if (fs.existsSync(dbPath)) {
			data = fs.readFileSync(dbPath)
		}

		const db = data ? new sqlJs.Database(data) : new sqlJs.Database()
		return new SqlJsDatabase(db, dbPath)
	}

	private static _sqlJsSync: SqlJsStatic | null = null

	/**
	 * Initialize the WASM module. Must be called once before using openSync().
	 */
	static async init(): Promise<void> {
		SqlJsDatabase._sqlJsSync = await SqlJsDatabase.getSqlJs()
	}

	/**
	 * Initialize synchronously using a pre-cached WASM module.
	 * Requires initSqlJs to have been loaded already (e.g. by a prior async call).
	 */
	static initFromCache(sqlJsModule: SqlJsStatic): void {
		SqlJsDatabase._sqlJsSync = sqlJsModule
	}

	prepare(sql: string): Statement {
		return new Statement(this.db, sql, () => this.markDirty())
	}

	exec(sql: string): void {
		this.db.exec(sql)
		this.markDirty()
	}

	pragma(pragmaStr: string): void {
		try {
			this.db.run(`PRAGMA ${pragmaStr}`)
		} catch {
			// Some pragmas may not be supported in sql.js (e.g., WAL)
		}
	}

	transaction<T>(fn: () => T): () => T {
		const self = this
		return function () {
			self.db.run("BEGIN TRANSACTION")
			self.inTransaction = true
			try {
				const result = fn()
				self.db.run("COMMIT")
				self.inTransaction = false
				self.markDirty()
				return result
			} catch (err) {
				self.inTransaction = false
				// SQLite auto-rolls back on error, so ROLLBACK may fail if already rolled back
				try {
					self.db.run("ROLLBACK")
				} catch {
					// Transaction was already rolled back by SQLite — this is expected
				}
				throw err
			}
		}
	}

	export(): Uint8Array {
		return this.db.export()
	}

	close(): void {
		if (this.dirty && this.dbPath) {
			this.flushSync()
		}
		this.db.close()
	}

	// --- Internal persistence ---

	/**
	 * Persist to disk synchronously after every write.
	 * This is critical because sql.js keeps data in memory only —
	 * if the process dies before flush, all writes are lost.
	 * better-sqlite3 wrote to disk automatically; sql.js requires explicit flush.
	 *
	 * IMPORTANT: db.export() destroys active transaction state in sql.js,
	 * so we skip the flush during transactions. The flush happens after COMMIT.
	 */
	private markDirty(): void {
		this.dirty = true
		if (this.dbPath && !this.inTransaction) {
			this.flushSync()
		}
	}

	flushSync(): void {
		if (!this.dbPath || !this.dirty) return
		try {
			const data = this.db.export()
			fs.writeFileSync(this.dbPath, Buffer.from(data))
			this.dirty = false
		} catch (err) {
			Logger.log("[SqlJsDatabase] Failed to persist: " + err)
		}
	}
}
