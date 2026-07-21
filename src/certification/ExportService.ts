import * as ExcelJS from "exceljs"
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import type { ProjectDatabase } from "./db/ProjectDatabase"
import type { AuditTrailService } from "./AuditTrailService"
import type { AuditTrailRow, ExportOptions, TraceabilityMatrixRow } from "./types"

/**
 * ExportService - Export traceability matrix, audit log, and verification packages.
 * Supports CSV, Excel (xlsx), and PDF (via webview print).
 */
export class ExportService {
	private db: ProjectDatabase
	private auditService: AuditTrailService

	constructor(db: ProjectDatabase, auditService: AuditTrailService) {
		this.db = db
		this.auditService = auditService
	}

	/**
	 * Export traceability matrix as CSV or Excel.
	 */
	async exportTraceabilityMatrix(options: ExportOptions = { format: "xlsx" }): Promise<string> {
		const requirements = this.db.getAllRequirements()
		const links = this.db.getAllLinks()

		// Build matrix rows
		const matrix: TraceabilityMatrixRow[] = requirements.map((req) => {
			const reqLinks = links.filter((l) => l.requirement_id === req.requirement_id)
			const sourceFiles = reqLinks
				.filter((l) => l.artifact_type === "source_code")
				.map((l) => l.artifact_path || "")
				.filter(Boolean)
			const testFiles = reqLinks
				.filter((l) => l.artifact_type === "test_case" || l.artifact_type === "test_result")
				.map((l) => l.artifact_path || "")
				.filter(Boolean)
			const docFiles = reqLinks
				.filter((l) => l.artifact_type === "document")
				.map((l) => l.artifact_path || "")
				.filter(Boolean)

			const totalArtifacts = sourceFiles.length + testFiles.length + docFiles.length
			const coverage = totalArtifacts > 0 ? 100 : 0

			return {
				requirement_id: req.requirement_id,
				requirement_level: req.level,
				title: req.title,
				dal_level: req.dal_level,
				status: req.status,
				linked_source_files: sourceFiles,
				linked_test_files: testFiles,
				linked_documents: docFiles,
				coverage_percent: coverage,
			}
		})

		const filePath = await this.promptExportPath("traceability_matrix", options.format)

		if (options.format === "xlsx") {
			await this.writeExcelMatrix(matrix, filePath)
		} else {
			this.writeCsvMatrix(matrix, filePath)
		}

		return filePath
	}

	/**
	 * Export audit log as CSV.
	 */
	async exportAuditLog(options: ExportOptions = { format: "csv" }): Promise<string> {
		const entries = this.auditService.queryEvents({
			start_date: options.start_date,
			end_date: options.end_date,
			limit: 100000,
		})

		const filePath = await this.promptExportPath("audit_log", options.format)

		if (options.format === "xlsx") {
			await this.writeExcelAuditLog(entries, filePath)
		} else {
			const csv = this.auditService.exportCSV(options)
			fs.writeFileSync(filePath, csv, "utf8")
		}

		return filePath
	}

	/**
	 * Export verification package (all exports in one directory).
	 */
	async exportVerificationPackage(): Promise<string> {
		const folderPath = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: "Export Here",
		})

		if (!folderPath || folderPath.length === 0) throw new Error("Export cancelled")

		const dir = folderPath[0].fsPath

		// Export traceability matrix
		const matrixPath = path.join(dir, "traceability_matrix.xlsx")
		const requirements = this.db.getAllRequirements()
		const links = this.db.getAllLinks()

		const matrix: TraceabilityMatrixRow[] = requirements.map((req) => {
			const reqLinks = links.filter((l) => l.requirement_id === req.requirement_id)
			return {
				requirement_id: req.requirement_id,
				requirement_level: req.level,
				title: req.title,
				dal_level: req.dal_level,
				status: req.status,
				linked_source_files: reqLinks
					.filter((l) => l.artifact_type === "source_code")
					.map((l) => l.artifact_path || "")
					.filter(Boolean),
				linked_test_files: reqLinks
					.filter((l) => l.artifact_type === "test_case" || l.artifact_type === "test_result")
					.map((l) => l.artifact_path || "")
					.filter(Boolean),
				linked_documents: reqLinks
					.filter((l) => l.artifact_type === "document")
					.map((l) => l.artifact_path || "")
					.filter(Boolean),
				coverage_percent: reqLinks.length > 0 ? 100 : 0,
			}
		})

		await this.writeExcelMatrix(matrix, matrixPath)

		// Export audit log
		const auditPath = path.join(dir, "audit_log.csv")
		const csv = this.auditService.exportCSV()
		fs.writeFileSync(auditPath, csv, "utf8")

		// Export decision statistics
		const statsPath = path.join(dir, "decision_statistics.json")
		const stats = this.auditService.getDecisionStats()
		fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), "utf8")

		// Export requirements summary
		const reqsPath = path.join(dir, "requirements_summary.json")
		fs.writeFileSync(reqsPath, JSON.stringify(requirements, null, 2), "utf8")

		return dir
	}

	// --- Private Helpers ---

	private async promptExportPath(name: string, format: string): Promise<string> {
		const uri = await vscode.window.showSaveDialog({
			defaultUri: vscode.Uri.file(`${name}.${format}`),
			saveLabel: `Export ${name}`,
			filters:
				format === "xlsx"
					? { "Excel files": ["xlsx"], "All files": ["*"] }
					: { "CSV files": ["csv"], "All files": ["*"] },
		})

		if (!uri) throw new Error("Export cancelled")
		return uri.fsPath
	}

	private async writeExcelMatrix(matrix: TraceabilityMatrixRow[], filePath: string): Promise<void> {
		const workbook = new ExcelJS.Workbook()
		const sheet = workbook.addWorksheet("Traceability Matrix")

		// Headers
		sheet.columns = [
			{ header: "Requirement ID", key: "requirement_id", width: 20 },
			{ header: "Level", key: "requirement_level", width: 15 },
			{ header: "Title", key: "title", width: 40 },
			{ header: "DAL Level", key: "dal_level", width: 12 },
			{ header: "Status", key: "status", width: 12 },
			{ header: "Source Files", key: "linked_source_files", width: 50 },
			{ header: "Test Files", key: "linked_test_files", width: 50 },
			{ header: "Coverage %", key: "coverage_percent", width: 12 },
		]

		// Style headers
		sheet.getRow(1).font = { bold: true }
		sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } }
		sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }

		// Data rows
		for (const row of matrix) {
			sheet.addRow({
				requirement_id: row.requirement_id,
				requirement_level: row.requirement_level,
				title: row.title,
				dal_level: row.dal_level || "-",
				status: row.status,
				linked_source_files: row.linked_source_files.join("\n"),
				linked_test_files: row.linked_test_files.join("\n"),
				coverage_percent: row.coverage_percent,
			})
		}

		// Freeze header row
		sheet.views = [{ state: "frozen", ySplit: 1 }]

		await workbook.xlsx.writeFile(filePath)
	}

	private writeCsvMatrix(matrix: TraceabilityMatrixRow[], filePath: string): void {
		const escapeCsv = (value: string): string => {
			if (value.includes(",") || value.includes('"') || value.includes("\n")) {
				return `"${value.replace(/"/g, '""')}"`
			}
			return value
		}

		const headers = ["Requirement ID", "Level", "Title", "DAL Level", "Status", "Source Files", "Test Files", "Coverage %"]
		const rows = matrix.map((row) => [
			row.requirement_id,
			row.requirement_level,
			row.title,
			row.dal_level || "-",
			row.status,
			row.linked_source_files.join("; "),
			row.linked_test_files.join("; "),
			String(row.coverage_percent),
		])

		const csv = [headers.map(escapeCsv).join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\n")
		fs.writeFileSync(filePath, csv, "utf8")
	}

	private async writeExcelAuditLog(entries: AuditTrailRow[], filePath: string): Promise<void> {
		const workbook = new ExcelJS.Workbook()
		const sheet = workbook.addWorksheet("Audit Log")

		if (entries.length === 0) {
			sheet.addRow(["No audit entries found"])
			await workbook.xlsx.writeFile(filePath)
			return
		}

		// Use keys from first entry as columns
		const keys = Object.keys(entries[0]).filter((k) => k !== "payload") as Array<keyof AuditTrailRow>
		sheet.columns = keys.map((k) => ({
			header: String(k)
				.replace(/_/g, " ")
				.replace(/\b\w/g, (c) => c.toUpperCase()),
			key: k as string,
			width: 20,
		}))

		sheet.getRow(1).font = { bold: true }
		sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } }
		sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }

		for (const entry of entries) {
			const row: Record<string, unknown> = {}
			for (const key of keys) {
				row[key as string] = entry[key]
			}
			sheet.addRow(row)
		}

		sheet.views = [{ state: "frozen", ySplit: 1 }]

		await workbook.xlsx.writeFile(filePath)
	}
}
