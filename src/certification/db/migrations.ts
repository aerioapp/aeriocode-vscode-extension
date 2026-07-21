import type { SqlJsDatabase } from "./SqlJsDatabase"
import { Logger } from "@/services/logging/Logger"

// Schema version for migration support
const SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT
);`

// Project database schema (Version 1: Initial)
const PROJECT_SCHEMA_V1 = `
-- Certification profile for this project
CREATE TABLE IF NOT EXISTS certification_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  standard TEXT NOT NULL,
  standard_version TEXT,
  level TEXT NOT NULL,
  workspace_path TEXT,
  config TEXT DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Project requirements registry
CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id TEXT NOT NULL UNIQUE,
  level TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  dal_level TEXT,
  status TEXT DEFAULT 'active',
  parent_requirement_id TEXT,
  source TEXT,
  rationale TEXT,
  change_history TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_req_id ON requirements(requirement_id);
CREATE INDEX IF NOT EXISTS idx_req_level ON requirements(level);
CREATE INDEX IF NOT EXISTS idx_req_parent ON requirements(parent_requirement_id);
CREATE INDEX IF NOT EXISTS idx_req_status ON requirements(status);

-- Bidirectional traceability links
CREATE TABLE IF NOT EXISTS traceability_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_path TEXT,
  artifact_line_start INTEGER,
  artifact_line_end INTEGER,
  artifact_content_hash TEXT,
  link_type TEXT NOT NULL,
  confidence TEXT DEFAULT 'auto',
  is_verified INTEGER DEFAULT 0,
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trace_req ON traceability_links(requirement_id);
CREATE INDEX IF NOT EXISTS idx_trace_artifact ON traceability_links(artifact_path);
CREATE INDEX IF NOT EXISTS idx_trace_type ON traceability_links(link_type);
CREATE INDEX IF NOT EXISTS idx_trace_req_art ON traceability_links(requirement_id, artifact_path);

-- Immutable audit trail (append-only, hash-chained)
CREATE TABLE IF NOT EXISTS audit_trail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_hash TEXT NOT NULL,
  previous_hash TEXT,
  event_type TEXT NOT NULL,
  event_action TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  task_id TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  entity_type TEXT,
  entity_id TEXT,
  model_id TEXT,
  model_version TEXT,
  profile_id INTEGER,
  payload TEXT NOT NULL
);

-- Immutability: prevent UPDATE and DELETE via trigger
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_trail
BEGIN
  SELECT RAISE(ABORT, 'Audit trail entries are immutable');
END;

CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_trail
BEGIN
  SELECT RAISE(ABORT, 'Audit trail entries are immutable');
END;

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_trail(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_trail(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_chain ON audit_trail(previous_hash);
CREATE INDEX IF NOT EXISTS idx_audit_task ON audit_trail(task_id);

-- AI generation metadata (one per AI interaction)
CREATE TABLE IF NOT EXISTS ai_generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generation_id TEXT NOT NULL UNIQUE,
  user_id TEXT,
  session_id TEXT,
  task_id TEXT,
  model_id TEXT NOT NULL,
  model_version TEXT,
  provider TEXT,
  user_message TEXT,
  user_message_hash TEXT,
  files_read TEXT DEFAULT '[]',
  files_written TEXT DEFAULT '[]',
  tool_calls TEXT DEFAULT '[]',
  requirement_tags_found TEXT DEFAULT '[]',
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  audit_entry_id INTEGER REFERENCES audit_trail(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gen_id ON ai_generations(generation_id);
CREATE INDEX IF NOT EXISTS idx_gen_user ON ai_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_gen_model ON ai_generations(model_id);
CREATE INDEX IF NOT EXISTS idx_gen_task ON ai_generations(task_id);
CREATE INDEX IF NOT EXISTS idx_gen_audit ON ai_generations(audit_entry_id);

-- Human decision records
CREATE TABLE IF NOT EXISTS human_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id TEXT NOT NULL UNIQUE,
  generation_id TEXT REFERENCES ai_generations(generation_id),
  user_id TEXT,
  decision TEXT NOT NULL,
  files_affected TEXT DEFAULT '[]',
  diff_summary TEXT,
  rationale TEXT,
  compliance_notes TEXT,
  presented_at TEXT,
  decided_at TEXT,
  decision_duration_ms INTEGER,
  audit_entry_id INTEGER REFERENCES audit_trail(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dec_gen ON human_decisions(generation_id);
CREATE INDEX IF NOT EXISTS idx_dec_user ON human_decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_dec_decision ON human_decisions(decision);

-- Integrity verification
CREATE TABLE IF NOT EXISTS integrity_check (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_type TEXT NOT NULL,
  check_at TEXT NOT NULL DEFAULT (datetime('now')),
  total_entries INTEGER,
  valid_entries INTEGER,
  invalid_entries INTEGER,
  details TEXT,
  passed INTEGER NOT NULL
);
`

// User database schema (Version 1: Initial)
const USER_SCHEMA_V1 = `
-- Lightweight cross-project index
CREATE TABLE IF NOT EXISTS project_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_path TEXT NOT NULL UNIQUE,
  project_name TEXT,
  profile_standard TEXT,
  profile_level TEXT,
  last_activity_at TEXT,
  total_generations INTEGER DEFAULT 0,
  total_decisions INTEGER DEFAULT 0,
  traceability_coverage REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proj_path ON project_index(project_path);
CREATE INDEX IF NOT EXISTS idx_proj_activity ON project_index(last_activity_at);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Export history (metadata only, not the files)
CREATE TABLE IF NOT EXISTS export_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_path TEXT NOT NULL,
  export_type TEXT NOT NULL,
  format TEXT NOT NULL,
  file_path TEXT NOT NULL,
  entry_count INTEGER,
  exported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

interface Migration {
	version: number
	description: string
	sql: string
}

const PROJECT_MIGRATIONS: Migration[] = [
	{
		version: 1,
		description: "Initial schema with requirements, traceability, audit trail, generations, and decisions",
		sql: PROJECT_SCHEMA_V1,
	},
	// Future migrations go here:
	// { version: 2, description: 'Add X column', sql: 'ALTER TABLE ...' },
]

const USER_MIGRATIONS: Migration[] = [
	{ version: 1, description: "Initial schema with project index, preferences, and export history", sql: USER_SCHEMA_V1 },
]

function runMigrations(db: SqlJsDatabase, migrations: Migration[], dbName: string): void {
	// Ensure schema_version table exists
	db.exec(SCHEMA_VERSION_TABLE)

	const versionRow = db.prepare("SELECT MAX(version) as v FROM schema_version").get() as { v: number | null } | undefined
	const currentVersion = versionRow?.v || 0

	for (const migration of migrations) {
		if (migration.version > currentVersion) {
			Logger.log(`[${dbName}] Applying migration v${migration.version}: ${migration.description}`)
			try {
				db.transaction(() => {
					db.exec(migration.sql)
					db.prepare("INSERT INTO schema_version (version, description) VALUES (?, ?)").run(
						migration.version,
						migration.description,
					)
				})()
			} catch (err) {
				Logger.log(`[${dbName}] Migration v${migration.version} FAILED: ${err}`)
				// Reset schema_version so it retries on next DB open
				try {
					db.prepare("DELETE FROM schema_version WHERE version = ?").run(migration.version)
				} catch {
					/* ignore cleanup errors */
				}
				throw err
			}
		}
	}

	// Verify critical tables exist — if migration was previously applied but tables are missing (e.g. partial failure), re-run
	verifySchema(db, migrations, dbName)
}

/**
 * Verify all critical tables exist. If any are missing, force re-run pending migrations.
 * This handles the case where schema_version recorded a version but the actual DDL failed silently.
 */
function verifySchema(db: SqlJsDatabase, migrations: Migration[], dbName: string): void {
	const REQUIRED_TABLES = [
		"certification_profile",
		"requirements",
		"traceability_links",
		"audit_trail",
		"ai_generations",
		"human_decisions",
		"integrity_check",
	]

	const existingTables = new Set<string>()
	const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {
		name: string
	}[]
	for (const row of rows) {
		existingTables.add(row.name)
	}

	const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t))
	if (missingTables.length === 0) return

	Logger.log(
		`[${dbName}] Schema verification found missing tables: ${missingTables.join(", ")} — resetting and re-running migrations`,
	)

	// Clear schema_version so migrations re-run
	try {
		db.prepare("DELETE FROM schema_version").run()
	} catch {
		/* ignore */
	}

	// Re-run all migrations
	for (const migration of migrations) {
		Logger.log(`[${dbName}] Re-applying migration v${migration.version}: ${migration.description}`)
		try {
			db.transaction(() => {
				db.exec(migration.sql)
				db.prepare("INSERT INTO schema_version (version, description) VALUES (?, ?)").run(
					migration.version,
					migration.description,
				)
			})()
		} catch (err) {
			Logger.log(`[${dbName}] Migration v${migration.version} FAILED on retry: ${err}`)
			throw err
		}
	}
}

export function migrateProjectDatabase(db: SqlJsDatabase): void {
	runMigrations(db, PROJECT_MIGRATIONS, "ProjectDB")
}

export function migrateUserDatabase(db: SqlJsDatabase): void {
	runMigrations(db, USER_MIGRATIONS, "UserDB")
}

export function getProjectSchemaVersion(db: SqlJsDatabase): number {
	const row = db.prepare("SELECT MAX(version) as v FROM schema_version").get() as { v: number | null } | undefined
	return row?.v || 0
}

export function getUserSchemaVersion(db: SqlJsDatabase): number {
	const row = db.prepare("SELECT MAX(version) as v FROM schema_version").get() as { v: number | null } | undefined
	return row?.v || 0
}
