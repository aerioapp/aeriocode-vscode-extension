import { SqlJsDatabase } from "./SqlJsDatabase"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { migrateUserDatabase, getUserSchemaVersion } from "./migrations"
import type { ProjectIndexRow, ExportHistoryRow } from "../types"

const USER_DB_DIR = path.join(os.homedir(), ".aeriocode")
const USER_DB_NAME = "user.db"

export class UserDatabase {
	private db: SqlJsDatabase
	private dbPath: string

	constructor() {
		this.dbPath = path.join(USER_DB_DIR, USER_DB_NAME)

		// Ensure ~/.aeriocode/ directory exists
		if (!fs.existsSync(USER_DB_DIR)) {
			fs.mkdirSync(USER_DB_DIR, { recursive: true })
		}

		// Initialize database (WASM must be pre-initialized via SqlJsDatabase.init())
		this.db = SqlJsDatabase.openSync(this.dbPath)
		migrateUserDatabase(this.db)
	}

	getSchemaVersion(): number {
		return getUserSchemaVersion(this.db)
	}

	// --- Project Index ---

	upsertProjectIndex(project: {
		project_path: string
		project_name?: string
		profile_standard?: string
		profile_level?: string
		last_activity_at?: string
		total_generations?: number
		total_decisions?: number
		traceability_coverage?: number
	}): void {
		const existing = this.db.prepare("SELECT id FROM project_index WHERE project_path = ?").get(project.project_path) as
			{ id: number } | undefined

		if (existing) {
			const fields: string[] = []
			const values: unknown[] = []

			if (project.project_name !== undefined) {
				fields.push("project_name = ?")
				values.push(project.project_name)
			}
			if (project.profile_standard !== undefined) {
				fields.push("profile_standard = ?")
				values.push(project.profile_standard)
			}
			if (project.profile_level !== undefined) {
				fields.push("profile_level = ?")
				values.push(project.profile_level)
			}
			if (project.last_activity_at !== undefined) {
				fields.push("last_activity_at = ?")
				values.push(project.last_activity_at)
			}
			if (project.total_generations !== undefined) {
				fields.push("total_generations = ?")
				values.push(project.total_generations)
			}
			if (project.total_decisions !== undefined) {
				fields.push("total_decisions = ?")
				values.push(project.total_decisions)
			}
			if (project.traceability_coverage !== undefined) {
				fields.push("traceability_coverage = ?")
				values.push(project.traceability_coverage)
			}

			if (fields.length > 0) {
				fields.push("updated_at = datetime('now')")
				values.push(project.project_path)
				this.db.prepare(`UPDATE project_index SET ${fields.join(", ")} WHERE project_path = ?`).run(...values)
			}
		} else {
			this.db
				.prepare(
					`
				INSERT INTO project_index (project_path, project_name, profile_standard, profile_level, last_activity_at, total_generations, total_decisions, traceability_coverage)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`,
				)
				.run(
					project.project_path,
					project.project_name || null,
					project.profile_standard || null,
					project.profile_level || null,
					project.last_activity_at || null,
					project.total_generations || 0,
					project.total_decisions || 0,
					project.traceability_coverage || 0,
				)
		}
	}

	getProjectIndex(projectPath: string): ProjectIndexRow | undefined {
		return this.db.prepare("SELECT * FROM project_index WHERE project_path = ?").get(projectPath) as
			ProjectIndexRow | undefined
	}

	getAllProjects(): ProjectIndexRow[] {
		return this.db.prepare("SELECT * FROM project_index ORDER BY last_activity_at DESC").all() as ProjectIndexRow[]
	}

	deleteProjectIndex(projectPath: string): void {
		this.db.prepare("DELETE FROM project_index WHERE project_path = ?").run(projectPath)
	}

	// --- User Preferences ---

	getPreference(key: string): string | undefined {
		const row = this.db.prepare("SELECT value FROM user_preferences WHERE key = ?").get(key) as { value: string } | undefined
		return row?.value
	}

	setPreference(key: string, value: string): void {
		this.db
			.prepare(
				`
			INSERT INTO user_preferences (key, value, updated_at) VALUES (?, ?, datetime('now'))
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
		`,
			)
			.run(key, value)
	}

	getAllPreferences(): Record<string, string> {
		const rows = this.db.prepare("SELECT key, value FROM user_preferences").all() as Array<{ key: string; value: string }>
		const prefs: Record<string, string> = {}
		for (const row of rows) {
			prefs[row.key] = row.value
		}
		return prefs
	}

	// --- Export History ---

	insertExportHistory(export_entry: {
		project_path: string
		export_type: string
		format: string
		file_path: string
		entry_count?: number
	}): number {
		const result = this.db
			.prepare(
				`
			INSERT INTO export_history (project_path, export_type, format, file_path, entry_count)
			VALUES (?, ?, ?, ?, ?)
		`,
			)
			.run(
				export_entry.project_path,
				export_entry.export_type,
				export_entry.format,
				export_entry.file_path,
				export_entry.entry_count || null,
			)
		return result.lastInsertRowid as number
	}

	getExportHistory(projectPath: string, limit: number = 50): ExportHistoryRow[] {
		return this.db
			.prepare("SELECT * FROM export_history WHERE project_path = ? ORDER BY exported_at DESC LIMIT ?")
			.all(projectPath, limit) as ExportHistoryRow[]
	}

	// --- Transaction wrapper ---

	transaction<T>(fn: () => T): T {
		return this.db.transaction(fn)()
	}

	// --- Close ---

	close(): void {
		try {
			this.db.close()
		} catch {
			// Already closed or invalid
		}
	}
}
