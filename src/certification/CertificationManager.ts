import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import { EventEmitter } from "events"
import { ProjectDatabase } from "./db/ProjectDatabase"
import { UserDatabase } from "./db/UserDatabase"
import { ProfileLoader } from "./ProfileLoader"
import { AuditTrailService } from "./AuditTrailService"
import { TraceabilityChecker } from "./TraceabilityChecker"
import { RequirementTagParser } from "./RequirementTagParser"
import type { CertificationProfile, CertificationStatus, GenerationStartParams, DecisionParams } from "./types"
import { Logger } from "@/services/logging/Logger"

/**
 * CertificationManager - Singleton orchestrator for all certification features.
 *
 * CRITICAL: isActive gates ALL certification functionality.
 * When false, every public method is a silent no-op.
 * Extension works identically to Phase 1 when isActive = false.
 */
export class CertificationManager implements vscode.Disposable {
	private static instance: CertificationManager | null = null

	private projectDb: ProjectDatabase | null = null
	private userDb: UserDatabase | null = null
	private activeProfile: CertificationProfile | null = null
	private activeProfileLevel: string | null = null
	private auditService: AuditTrailService | null = null
	private traceabilityChecker: TraceabilityChecker | null = null
	private workspacePath: string | null = null
	private disposables: vscode.Disposable[] = []
	private fileWatcher: vscode.FileSystemWatcher | null = null
	private eventEmitter = new EventEmitter()
	private intentionallyDeactivated = false

	// Certification is active only when both projectDb and activeProfile are set
	private get isActive(): boolean {
		return this.projectDb !== null && this.activeProfile !== null
	}

	private constructor(private context: vscode.ExtensionContext) {
		// UserDatabase is lazily initialized on first access
	}

	static getInstance(context?: vscode.ExtensionContext): CertificationManager {
		if (!CertificationManager.instance) {
			if (!context) {
				throw new Error("CertificationManager must be initialized with an ExtensionContext")
			}
			CertificationManager.instance = new CertificationManager(context)
		}
		return CertificationManager.instance
	}

	/**
	 * Initialize the certification system. Called once on extension activate.
	 * Always succeeds — no errors thrown, no prompts shown.
	 */
	static initialize(context: vscode.ExtensionContext): CertificationManager {
		const manager = CertificationManager.getInstance(context)

		// Watch for workspace folder changes
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			const firstFolder = vscode.workspace.workspaceFolders[0]
			try {
				manager.onWorkspaceChanged(firstFolder.uri.fsPath)
			} catch (err) {
				Logger.log("Certification workspace init skipped: " + err)
			}
		}

		// Watch for workspace folder changes and track subscription for cleanup
		manager.disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders((event) => {
				if (event.added.length > 0) {
					try {
						manager.onWorkspaceChanged(event.added[0].uri.fsPath)
					} catch (err) {
						Logger.log("Certification workspace change skipped: " + err)
					}
				}
			}),
		)

		return manager
	}

	/**
	 * Called when workspace folder is opened/changed.
	 * If no .aeriocode/ exists: do nothing.
	 * If .aeriocode/ exists but no profile.json: create DB, wait for profile setup.
	 * If profile.json exists: open DB, load profile, activate certification.
	 */
	onWorkspaceChanged(workspacePath: string): void {
		// Skip re-initialization if certification was intentionally deactivated
		// until the user explicitly activates again via activateProfile()
		if (this.intentionallyDeactivated) {
			return
		}

		// Clean up previous workspace resources
		this.cleanup()

		this.workspacePath = workspacePath
		const aeriocodeDir = path.join(workspacePath, ".aeriocode")

		// Check if .aeriocode/ directory exists
		if (!fs.existsSync(aeriocodeDir)) {
			// No .aeriocode/ directory — certification disabled, extension works as Phase 1
			return
		}

		// .aeriocode/ exists — open project database
		try {
			this.projectDb = new ProjectDatabase(workspacePath)
		} catch (error) {
			Logger.log("[Certification] Failed to open project database: " + error)
			this.projectDb = null
			return
		}

		// Try to load effective profile
		const profile = ProfileLoader.getEffectiveProfile(workspacePath)
		if (profile) {
			this.activeProfile = profile
			this.auditService = new AuditTrailService(this.projectDb)

			// Get active level from project profile or default to first available
			const projectProfile = ProfileLoader.loadProjectProfile(workspacePath)
			if (projectProfile) {
				const levels = Object.keys(projectProfile.levels)
				this.activeProfileLevel = levels[0] || null
			} else {
				const levels = Object.keys(profile.levels)
				this.activeProfileLevel = levels[0] || null
			}

			// Update user DB project index
			this.getUserDb().upsertProjectIndex({
				project_path: workspacePath,
				profile_standard: profile.standard,
				profile_level: this.activeProfileLevel || undefined,
				last_activity_at: new Date().toISOString(),
			})

			// Register file save watcher for traceability checks
			this.registerFileWatcher()

			Logger.log(`[Certification] Active: ${profile.standard} ${this.activeProfileLevel || ""}`)
		} else {
			// No profile configured — certification remains dormant
		}
	}

	/**
	 * Manually activate certification with a specific profile and level.
	 * Called from profile setup wizard.
	 */
	async activateProfile(profile: CertificationProfile, level: string): Promise<void> {
		// Clear deactivation flag so workspace listener can re-initialize
		this.intentionallyDeactivated = false

		// Auto-discover workspace path if not set (e.g. onWorkspaceChanged didn't run)
		if (!this.workspacePath) {
			if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
				this.workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath
			} else {
				throw new Error("[Certification] activateProfile failed: no workspace open.")
			}
		}

		// Save project profile
		ProfileLoader.saveProjectProfile(this.workspacePath, profile)

		// Ensure project DB exists
		if (!this.projectDb) {
			try {
				this.projectDb = new ProjectDatabase(this.workspacePath)
			} catch (error) {
				Logger.log("[Certification] Failed to create project database: " + error)
				throw new Error(`[Certification] Failed to create project database: ${error}`)
			}
		}

		this.activeProfile = profile
		this.activeProfileLevel = level
		this.auditService = new AuditTrailService(this.projectDb)
		this.traceabilityChecker = new TraceabilityChecker(this.projectDb)

		// Update user DB
		this.getUserDb().upsertProjectIndex({
			project_path: this.workspacePath,
			profile_standard: profile.standard,
			profile_level: level,
			last_activity_at: new Date().toISOString(),
		})

		// Register file watcher
		this.registerFileWatcher()

		// Record profile activation in audit trail
		try {
			await this.auditService.recordEvent({
				event_type: "profile_change",
				event_action: "activated",
				entity_type: "profile",
				entity_id: `${profile.standard}-${level}`,
				payload: {
					standard: profile.standard,
					version: profile.version,
					level,
				},
			})

			this.emitCertificationEvent({
				type: "profile_change",
				entityType: "profile",
				entityId: `${profile.standard}-${level}`,
				payload: JSON.stringify({ standard: profile.standard, level }),
				timestamp: new Date().toISOString(),
			})
		} catch (err) {
			Logger.log("[Certification] Failed to record audit event: " + err)
		}

		Logger.log(`[Certification] Profile activated: ${profile.standard} ${level}`)
	}

	/**
	 * Deactivate certification for the current workspace.
	 * Removes the project profile, cleans up runtime state, and preserves audit data.
	 */
	async deactivateProfile(): Promise<void> {
		if (!this.workspacePath) {
			throw new Error("[Certification] deactivateProfile failed: no workspace set.")
		}

		// Record deactivation in audit trail before cleanup
		if (this.auditService && this.projectDb) {
			try {
				await this.auditService.recordEvent({
					event_type: "profile_change",
					event_action: "deactivated",
					entity_type: "profile",
					entity_id: this.activeProfile ? `${this.activeProfile.standard}-${this.activeProfileLevel}` : "unknown",
					payload: {
						standard: this.activeProfile?.standard || null,
						level: this.activeProfileLevel || null,
					},
				})
			} catch (err) {
				Logger.log("[Certification] Failed to record deactivation audit event: " + err)
			}
		}

		// Remove the project profile file
		ProfileLoader.removeProjectProfile(this.workspacePath)

		// Clean up runtime state (disposes file watcher, closes DB, resets fields)
		this.cleanup()

		// Prevent workspace listener from re-initializing until user explicitly activates
		this.intentionallyDeactivated = true

		Logger.log(`[Certification] Profile deactivated for ${this.workspacePath}`)
	}

	/**
	 * Permanently delete all certification data for the current workspace.
	 * Removes the entire .aeriocode/ directory including the database.
	 * This action is irreversible — requires explicit user confirmation.
	 */
	async deleteProjectData(): Promise<void> {
		if (!this.workspacePath) {
			throw new Error("[Certification] deleteProjectData failed: no workspace set.")
		}

		// Clean up runtime state first (close DB handle, dispose watchers)
		this.cleanup()

		// Remove the entire .aeriocode/ directory
		const aeriocodeDir = path.join(this.workspacePath, ".aeriocode")
		try {
			if (fs.existsSync(aeriocodeDir)) {
				fs.rmSync(aeriocodeDir, { recursive: true, force: true })
			}
		} catch (err) {
			Logger.log("[Certification] Failed to delete .aeriocode/ directory: " + err)
			throw new Error(`[Certification] Failed to delete project data: ${err}`)
		}

		// Prevent workspace listener from re-initializing until user explicitly activates
		this.intentionallyDeactivated = true

		Logger.log(`[Certification] All project data deleted for ${this.workspacePath}`)
	}

	// --- Event Handlers (all are silent no-ops when isActive = false) ---

	/**
	 * Called when a file is saved. Runs traceability checks incrementally.
	 * No-op when inactive.
	 */
	async onFileSaved(filePath: string, content: string): Promise<void> {
		if (!this.isActive) return
		// TraceabilityChecker handles this via its own file watcher
	}

	/**
	 * Called when an AI generation starts. Records metadata and returns generation ID.
	 * Returns null when inactive.
	 */
	async onAIGenerationStarted(params: GenerationStartParams): Promise<string | null> {
		if (!this.isActive || !this.projectDb || !this.auditService) return null

		const generationId = params.generation_id
		const now = new Date().toISOString()

		// Scan user message for requirement tags
		let requirementTagsFound: string[] = []
		if (params.user_message) {
			const tags = RequirementTagParser.parse(params.user_message, "<user-message>")
			requirementTagsFound = [...new Set(tags.map((t) => t.requirement_id))]
		}

		try {
			// Insert generation record
			this.projectDb.insertGeneration({
				generation_id: generationId,
				user_id: params.user_id,
				session_id: params.session_id,
				task_id: params.task_id,
				model_id: params.model_id,
				model_version: params.model_version,
				provider: params.provider,
				user_message: params.user_message,
				files_read: params.files_read,
				files_written: params.files_written,
				tool_calls: params.tool_calls,
				requirement_tags_found: requirementTagsFound,
				started_at: now,
			})

			// Record audit event
			await this.auditService.recordEvent({
				event_type: "ai_generation",
				event_action: "started",
				user_id: params.user_id,
				session_id: params.session_id,
				task_id: params.task_id,
				entity_type: "ai_suggestion",
				entity_id: generationId,
				model_id: params.model_id,
				model_version: params.model_version,
				profile_id: this.getActiveProfileId(),
				payload: {
					generation_id: generationId,
					model_id: params.model_id,
					files_read: params.files_read || [],
					requirement_tags_found: requirementTagsFound,
					extension_version: this.context.extension?.packageJSON?.version || "unknown",
					db_schema_version: this.projectDb.getSchemaVersion(),
				},
			})

			this.emitCertificationEvent({
				type: "ai_generation",
				entityType: "ai_suggestion",
				entityId: generationId,
				payload: JSON.stringify({ model_id: params.model_id }),
				timestamp: now,
			})
		} catch (err) {
			Logger.log("Certification: onAIGenerationStarted failed: " + err)
		}

		return generationId
	}

	/**
	 * Called when an AI generation completes.
	 * No-op when inactive.
	 */
	async onAIGenerationCompleted(generationId: string, filesWritten?: string[]): Promise<void> {
		if (!this.isActive || !this.projectDb || !this.auditService) return

		try {
			const now = new Date().toISOString()
			const generation = this.projectDb.getGeneration(generationId)

			this.projectDb.updateGenerationCompletion(generationId, {
				completed_at: now,
				duration_ms: generation?.started_at
					? new Date(now).getTime() - new Date(generation.started_at).getTime()
					: undefined,
				files_written: filesWritten,
			})

			await this.auditService.recordEvent({
				event_type: "ai_generation",
				event_action: "completed",
				entity_type: "ai_suggestion",
				entity_id: generationId,
				profile_id: this.getActiveProfileId(),
				payload: {
					generation_id: generationId,
					files_written: filesWritten || [],
				},
			})

			this.emitCertificationEvent({
				type: "ai_generation",
				entityType: "ai_suggestion",
				entityId: generationId,
				payload: JSON.stringify({ files_written: filesWritten || [] }),
				timestamp: now,
			})
		} catch (err) {
			Logger.log("Certification: onAIGenerationCompleted failed: " + err)
		}
	}

	/**
	 * Called when a human makes a decision on an AI suggestion.
	 * No-op when inactive.
	 */
	async onHumanDecision(params: DecisionParams): Promise<void> {
		if (!this.isActive || !this.projectDb || !this.auditService) return

		try {
			const now = new Date().toISOString()
			const generation = this.projectDb.getGeneration(params.generation_id)

			const decisionId = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

			this.projectDb.insertDecision({
				decision_id: decisionId,
				generation_id: params.generation_id,
				user_id: params.user_id,
				decision: params.decision,
				files_affected: params.files_affected,
				diff_summary: params.diff_summary,
				rationale: params.rationale,
				compliance_notes: params.compliance_notes,
				presented_at: generation?.completed_at || undefined,
				decided_at: now,
				decision_duration_ms: generation?.completed_at
					? new Date(now).getTime() - new Date(generation.completed_at).getTime()
					: undefined,
			})

			await this.auditService.recordEvent({
				event_type: "human_decision",
				event_action: params.decision,
				user_id: params.user_id,
				entity_type: "ai_suggestion",
				entity_id: params.generation_id,
				model_id: generation?.model_id || undefined,
				profile_id: this.getActiveProfileId(),
				payload: {
					decision_id: decisionId,
					generation_id: params.generation_id,
					decision: params.decision,
					files_affected: params.files_affected || [],
					rationale: params.rationale || null,
					modifications_summary: params.diff_summary || null,
				},
			})

			this.emitCertificationEvent({
				type: "human_decision",
				entityType: "ai_suggestion",
				entityId: params.generation_id,
				payload: JSON.stringify({ decision: params.decision, decision_id: decisionId }),
				timestamp: now,
			})

			// Update user DB project index
			if (this.workspacePath) {
				const stats = this.projectDb.getDecisionStats()
				this.getUserDb().upsertProjectIndex({
					project_path: this.workspacePath,
					last_activity_at: now,
					total_decisions: stats.total,
				})
			}
		} catch (err) {
			Logger.log("Certification: onHumanDecision failed: " + err)
		}
	}

	// --- Status & Queries ---

	getStatus(): CertificationStatus {
		if (!this.isActive || !this.projectDb || !this.auditService) {
			return {
				active: false,
				profile: null,
				profile_level: null,
				traced_count: 0,
				untraced_count: 0,
				coverage_percent: 0,
				last_audit_entry: null,
				integrity_status: "unchecked",
				enforcement: null,
			}
		}

		const linkCounts = this.projectDb.getLinkCounts()
		const lastEntry = this.projectDb.getLastAuditEntry()
		const totalReqs = this.projectDb.getAllRequirements().length

		const coveragePercent = totalReqs > 0 ? Math.round((linkCounts.traced / totalReqs) * 100) : 0

		// Check last integrity verification result
		let integrityStatus: "valid" | "invalid" | "unchecked" = "unchecked"
		try {
			const lastCheck = this.projectDb
				.getRawDatabase()
				.prepare("SELECT status FROM integrity_check ORDER BY id DESC LIMIT 1")
				.get() as { status: string } | undefined
			if (lastCheck) {
				integrityStatus = lastCheck.status === "passed" ? "valid" : "invalid"
			}
		} catch {
			// integrity_check table may not exist yet
		}

		// Level-aware coverage enforcement
		let enforcement: CertificationStatus["enforcement"] = null
		if (this.activeProfile && this.activeProfileLevel) {
			const levelConfig = this.activeProfile.levels[this.activeProfileLevel]
			if (levelConfig) {
				// Use the profile's primary coverage metric to determine required coverage.
				// statement_coverage is the baseline fallback for any standard.
				const requiredCoverage = levelConfig.statement_coverage
				const passed = coveragePercent >= requiredCoverage
				enforcement = {
					requirements_met: linkCounts.traced,
					requirements_total: totalReqs,
					passed,
					level_id: this.activeProfileLevel,
					required_coverage: requiredCoverage,
					actual_coverage: coveragePercent,
					coverage_metric: levelConfig.coverage_metric || "requirements-based",
					message: passed
						? `Coverage meets ${levelConfig.label} requirements (${coveragePercent}% >= ${requiredCoverage}%)`
						: `Coverage below ${levelConfig.label} requirements (${coveragePercent}% < ${requiredCoverage}%)`,
				}
			}
		}

		return {
			active: true,
			profile: this.activeProfile,
			profile_level: this.activeProfileLevel,
			traced_count: linkCounts.traced,
			untraced_count: Math.max(0, totalReqs - linkCounts.traced),
			coverage_percent: coveragePercent,
			last_audit_entry: lastEntry?.timestamp || null,
			integrity_status: integrityStatus,
			enforcement,
		}
	}

	getProjectDb(): ProjectDatabase | null {
		return this.projectDb
	}

	getUserDb(): UserDatabase {
		if (!this.userDb) {
			this.userDb = new UserDatabase()
		}
		return this.userDb
	}

	getAuditService(): AuditTrailService | null {
		return this.auditService
	}

	/**
	 * Get all untraced functions across the workspace.
	 * Scans source files, parses requirement tags, and returns functions without linked requirements.
	 */
	getUntracedCode(): Array<{ name: string; start_line: number; end_line: number; file_path: string; language: string }> {
		if (!this.isActive || !this.projectDb || !this.traceabilityChecker) {
			return []
		}

		const results: Array<{ name: string; start_line: number; end_line: number; file_path: string; language: string }> = []
		const fs = require("fs") as typeof import("fs")
		const path = require("path") as typeof import("path")
		const sourceExtensions = [".c", ".h", ".cpp", ".cxx", ".cc", ".hpp", ".py", ".java", ".js", ".ts", ".go", ".rs"]

		const isSourceFile = (filePath: string): boolean => {
			const ext = "." + filePath.split(".").pop()?.toLowerCase()
			return sourceExtensions.includes(ext)
		}

		const scanDir = (dir: string): void => {
			try {
				for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
					const fullPath = path.join(dir, entry.name)
					if (entry.isDirectory()) {
						if (!["node_modules", ".git", "dist", "build", "__pycache__"].includes(entry.name)) {
							scanDir(fullPath)
						}
					} else if (isSourceFile(fullPath)) {
						try {
							const content = fs.readFileSync(fullPath, "utf8")
							const tags = RequirementTagParser.parse(content, fullPath)
							const requirements = this.projectDb!.getAllRequirements()
							const reqIds = requirements.map((r) => r.requirement_id)
							const { valid } = RequirementTagParser.validateTags(tags, reqIds)
							const untraced = RequirementTagParser.findUntracedFunctions(content, fullPath, valid)
							results.push(...untraced)
						} catch {
							// Skip files that can't be read
						}
					}
				}
			} catch {
				// Permission denied or not a directory
			}
		}

		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath
			scanDir(workspaceRoot)
		}

		return results
	}

	/**
	 * Subscribe to certification events (audit entries, traceability changes).
	 * Returns a disposable that removes the listener.
	 */
	onCertificationEvent(
		listener: (event: { type: string; entityType: string; entityId: string; payload: string; timestamp: string }) => void,
	): vscode.Disposable {
		this.eventEmitter.on("certification-event", listener)
		return { dispose: () => this.eventEmitter.removeListener("certification-event", listener) }
	}

	private emitCertificationEvent(event: {
		type: string
		entityType: string
		entityId: string
		payload: string
		timestamp: string
	}): void {
		this.eventEmitter.emit("certification-event", event)
	}

	getActiveProfile(): CertificationProfile | null {
		return this.activeProfile
	}

	getActiveProfileLevel(): string | null {
		return this.activeProfileLevel
	}

	private getActiveProfileId(): number | undefined {
		if (!this.projectDb) return undefined
		const raw = this.projectDb.getRawDatabase()
		const row = raw.prepare("SELECT id FROM certification_profile WHERE is_active = 1 LIMIT 1").get() as
			{ id: number } | undefined
		return row?.id
	}

	// --- Private Helpers ---

	private registerFileWatcher(): void {
		if (this.fileWatcher) {
			this.fileWatcher.dispose()
		}

		// Watch for file saves in the workspace
		this.fileWatcher = vscode.workspace.createFileSystemWatcher("**/*")
		this.fileWatcher.onDidChange(async (uri) => {
			if (!this.isActive) return

			// Only check source files (not .aeriocode/, not config files, not binaries)
			const filePath = uri.fsPath
			if (this.shouldCheckFile(filePath)) {
				try {
					const document = await vscode.workspace.openTextDocument(uri)
					await this.onFileSaved(filePath, document.getText())
				} catch {
					// File may not be openable as text — skip silently
				}
			}
		})
		this.disposables.push(this.fileWatcher)
	}

	private shouldCheckFile(filePath: string): boolean {
		// Skip .aeriocode/ directory
		if (filePath.includes(".aeriocode")) return false

		// Skip common non-source files
		const skipExtensions = [".json", ".md", ".txt", ".xml", ".yaml", ".yml", ".toml", ".lock", ".db", ".db-wal", ".db-shm"]
		const ext = path.extname(filePath).toLowerCase()
		if (skipExtensions.includes(ext)) return false

		// Skip common non-source directories
		const skipDirs = ["node_modules", ".git", "dist", "build", ".vscode", "__pycache__"]
		for (const dir of skipDirs) {
			if (filePath.includes(`/${dir}/`) || filePath.includes(`\\${dir}\\`)) return false
		}

		return true
	}

	private cleanup(): void {
		// Dispose file watcher
		if (this.fileWatcher) {
			this.fileWatcher.dispose()
			this.fileWatcher = null
		}

		// Dispose traceability checker
		if (this.traceabilityChecker) {
			this.traceabilityChecker.dispose()
			this.traceabilityChecker = null
		}

		// Close project database
		if (this.projectDb) {
			this.projectDb.close()
			this.projectDb = null
		}

		// Reset state
		this.activeProfile = null
		this.activeProfileLevel = null
		this.auditService = null
	}

	dispose(): void {
		this.cleanup()
		this.userDb?.close()
		this.eventEmitter.removeAllListeners()
		while (this.disposables.length) {
			const d = this.disposables.pop()
			d?.dispose()
		}
	}
}
