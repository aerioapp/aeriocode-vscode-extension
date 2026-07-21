import * as vscode from "vscode"
import { RequirementTagParser } from "./RequirementTagParser"
import type { ProjectDatabase } from "./db/ProjectDatabase"
import type { ParsedRequirementTag, UntracedFunction } from "./types"

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
		if (existing) clearTimeout(existing)

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
		if (!this.isSourceFile(filePath)) return

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
				`Untraced: function "${func.name}" has no linked requirement (DO-178C §5.5)`,
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
	 * Get traceability coverage for the entire project.
	 */
	async getProjectCoverage(): Promise<{
		totalFiles: number
		tracedFiles: number
		untracedFiles: number
		totalFunctions: number
		tracedFunctions: number
		coveragePercent: number
	}> {
		const links = this.db.getAllLinks()
		const uniqueTracedFiles = new Set(links.map((l) => l.artifact_path).filter(Boolean))
		const tracedFiles = uniqueTracedFiles.size

		// Count total source files in workspace using async findFiles
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

		const untracedFiles = Math.max(0, totalFiles - tracedFiles)
		const coveragePercent = totalFiles > 0 ? Math.round((tracedFiles / totalFiles) * 100) : 0

		return {
			totalFiles,
			tracedFiles,
			untracedFiles,
			totalFunctions: links.length,
			tracedFunctions: links.length,
			coveragePercent,
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
