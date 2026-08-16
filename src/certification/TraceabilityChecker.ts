import * as vscode from "vscode"
import { RequirementTagParser } from "./RequirementTagParser"
import type { ProjectDatabase } from "./db/ProjectDatabase"
import type { ParsedRequirementTag, UntracedFunction } from "./types"
import { summariseTraceability, type TraceabilitySummary } from "./traceabilityStatus"

/**
 * TraceabilityChecker - Non-blocking incremental traceability checks on file save.
 * Parses requirement tags, validates against known requirements, creates traceability links,
 * and flags untraced code via VS Code diagnostics.
 */
export class TraceabilityChecker implements vscode.Disposable {
	private disposables: vscode.Disposable[] = []
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map()
	private diagnosticCollection: vscode.DiagnosticCollection
	private db: ProjectDatabase

	constructor(db: ProjectDatabase) {
		this.db = db
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection("aeriocode-traceability")

		// Register file save listener
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument(async (document) => {
				await this.debouncedCheck(document)
			}),
		)

		// Register file close listener to clean up diagnostics
		this.disposables.push(
			vscode.workspace.onDidCloseTextDocument((document) => {
				this.diagnosticCollection.delete(document.uri)
			}),
		)

		this.disposables.push(this.diagnosticCollection)
	}

	/**
	 * Debounced check — runs 500ms after last save, non-blocking.
	 */
	private async debouncedCheck(document: vscode.TextDocument): Promise<void> {
		const key = document.uri.fsPath
		const existing = this.debounceTimers.get(key)
		if (existing) {
			clearTimeout(existing)
		}

		this.debounceTimers.set(
			key,
			setTimeout(async () => {
				this.debounceTimers.delete(key)
				await this.checkFile(document)
			}, 500),
		)
	}

	/**
	 * Check a single file for requirement coverage.
	 */
	private async checkFile(document: vscode.TextDocument): Promise<void> {
		const content = document.getText()
		const filePath = document.uri.fsPath

		// Skip non-source files
		if (!this.isSourceFile(filePath)) {
			return
		}

		// 1. Parse requirement tags from code
		const tags = RequirementTagParser.parse(content, filePath)

		// 2. Validate against known requirements
		const requirements = this.db.getAllRequirements()
		const reqIds = requirements.map((r) => r.requirement_id)
		const { valid, invalid } = RequirementTagParser.validateTags(tags, reqIds)

		// 3. Auto-create traceability links for valid tags
		for (const tag of valid) {
			this.db.insertTraceLink({
				requirement_id: tag.requirement_id,
				artifact_type: "source_code",
				artifact_path: filePath,
				artifact_line_start: tag.line,
				artifact_line_end: tag.line,
				link_type: "implements",
				confidence: "auto",
			})
		}

		// 4. Find untraced functions (functions without requirement tags)
		const untraced = RequirementTagParser.findUntracedFunctions(content, filePath, valid)

		// 5. Update VS Code diagnostics (warnings for untraced code)
		const diagnostics: vscode.Diagnostic[] = []

		// Add warnings for untraced functions
		for (const func of untraced) {
			const range = new vscode.Range(func.start_line - 1, 0, func.end_line - 1, 0)
			const diagnostic = new vscode.Diagnostic(
				range,
				// No regime clause is cited. This read "(DO-178C §5.5)" on every warning regardless of
				// the active profile, so an ECSS or NASA project was shown an airborne clause that does
				// not govern it. All three regimes require requirements-to-code traceability, but their
				// clause numbering differs and Aerio holds no verified per-regime citation for it —
				// inventing one would be worse than omitting it. The warning is actionable without it.
				`Untraced: function "${func.name}" has no linked requirement`,
				vscode.DiagnosticSeverity.Warning,
			)
			diagnostic.source = "Aeriocode Traceability"
			diagnostics.push(diagnostic)
		}

		// Add warnings for invalid requirement tags
		for (const tag of invalid) {
			const range = new vscode.Range(tag.line - 1, tag.column, tag.line - 1, tag.column + tag.requirement_id.length + 10)
			const diagnostic = new vscode.Diagnostic(
				range,
				`Unknown requirement: "${tag.requirement_id}" not found in requirements database`,
				vscode.DiagnosticSeverity.Warning,
			)
			diagnostic.source = "Aeriocode Traceability"
			diagnostics.push(diagnostic)
		}

		// Set diagnostics for this file
		this.diagnosticCollection.set(document.uri, diagnostics)
	}

	/**
	 * Check if a file is a source file worth analyzing.
	 */
	private isSourceFile(filePath: string): boolean {
		const sourceExtensions = [".c", ".h", ".cpp", ".cxx", ".cc", ".hpp", ".py", ".java", ".js", ".ts", ".go", ".rs"]
		const ext = "." + filePath.split(".").pop()?.toLowerCase()
		return sourceExtensions.includes(ext)
	}

	/**
	 * Manually trigger a check for a specific file.
	 */
	async checkFileManually(filePath: string): Promise<{
		tags: ParsedRequirementTag[]
		untraced: UntracedFunction[]
	}> {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
		const content = document.getText()
		const tags = RequirementTagParser.parse(content, filePath)

		const requirements = this.db.getAllRequirements()
		const reqIds = requirements.map((r) => r.requirement_id)
		const { valid } = RequirementTagParser.validateTags(tags, reqIds)
		const untraced = RequirementTagParser.findUntracedFunctions(content, filePath, valid)

		return { tags, untraced }
	}

	/**
	 * Traceability coverage for the whole project, in both directions.
	 *
	 * DO-178C 11.21 requires bi-directional associations, and this reported only one direction:
	 * how much *code* carried a tag. It never answered the question Table A-4 objective 6 and
	 * Table A-5 objective 5 actually ask — whether every requirement has implementing code.
	 *
	 * ⚠️ It also reported `totalFunctions` and `tracedFunctions` as the same value, so function
	 * coverage read 100% whatever the project looked like. Removed rather than corrected: the link
	 * table records artifacts, not functions, so there is no function total in it to report.
	 *
	 * ⚠️ The two directions come from `summariseTraceability`, not from a loop here. This file and
	 * the matrix controller each grew their own copy of that arithmetic in the same change that
	 * introduced it — two implementations of one answer, written a few hundred lines apart, which is
	 * the defect this module had just finished correcting. The file counts below stay, because they
	 * are the only part of this that is about the workspace rather than the baseline.
	 */
	async getProjectCoverage(): Promise<
		TraceabilitySummary & {
			totalFiles: number
			taggedFiles: number
			untaggedFiles: number
		}
	> {
		const links = this.db.getAllLinks()
		const summary = summariseTraceability(this.db.getAllRequirements(), links)
		const taggedPaths = new Set(links.map((link) => link.artifact_path).filter(Boolean))

		let totalFiles = 0
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			try {
				const files = await vscode.workspace.findFiles(
					"**/*.{c,h,cpp,cxx,cc,hpp,py,java,js,ts,go,rs}",
					"**/node_modules/**",
					5000,
				)
				totalFiles = files.length
			} catch {
				// findFiles may fail on very large workspaces
			}
		}

		return {
			...summary,
			totalFiles,
			taggedFiles: taggedPaths.size,
			// Untagged, not unintended. Aerio cannot tell code that implements nothing from code
			// nobody annotated, and the stronger claim would accuse a programme of something this
			// data does not show.
			untaggedFiles: Math.max(0, totalFiles - taggedPaths.size),
		}
	}

	dispose(): void {
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer)
		}
		this.debounceTimers.clear()

		for (const disposable of this.disposables) {
			disposable.dispose()
		}
	}
}
