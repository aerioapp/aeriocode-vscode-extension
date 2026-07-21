import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { memo, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { ExportRequest } from "@shared/proto/aeriocode/certification"

type ExportType = "traceability_matrix" | "audit_log" | "verification_package"

const ExportPanel = () => {
	const [exportType, setExportType] = useState<ExportType>("traceability_matrix")
	const [format, setFormat] = useState<"csv" | "xlsx">("xlsx")
	const [isExporting, setIsExporting] = useState(false)
	const [lastExport, setLastExport] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const handleExport = async () => {
		setIsExporting(true)
		setError(null)
		try {
			let response
			if (exportType === "traceability_matrix") {
				response = await CertificationServiceClient.exportTraceabilityMatrix(ExportRequest.create({ format }))
			} else if (exportType === "audit_log") {
				response = await CertificationServiceClient.exportAuditLog(ExportRequest.create({ format }))
			} else {
				response = await CertificationServiceClient.exportVerificationPackage(EmptyRequest.create({}))
			}

			if (response.success) {
				setLastExport(new Date().toISOString())
			} else {
				setError(response.error || "Export failed")
			}
		} catch (err) {
			setError(String(err))
		} finally {
			setIsExporting(false)
		}
	}

	return (
		<div className="flex flex-col gap-[16px]">
			<h4 className="text-[13px] text-[var(--vscode-foreground)] m-0">Export Certification Data</h4>

			{/* Export Type */}
			<div className="flex flex-col gap-[4px]">
				<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Export Type</label>
				<VSCodeDropdown
					value={exportType}
					onChange={(e) => setExportType((e.target as HTMLSelectElement).value as ExportType)}>
					<VSCodeOption value="traceability_matrix">Traceability Matrix</VSCodeOption>
					<VSCodeOption value="audit_log">Audit Log</VSCodeOption>
					<VSCodeOption value="verification_package">Verification Package (All)</VSCodeOption>
				</VSCodeDropdown>
			</div>

			{/* Format (only for individual exports) */}
			{exportType !== "verification_package" && (
				<div className="flex flex-col gap-[4px]">
					<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Format</label>
					<VSCodeDropdown
						value={format}
						onChange={(e) => setFormat((e.target as HTMLSelectElement).value as "csv" | "xlsx")}>
						<VSCodeOption value="xlsx">Excel (.xlsx)</VSCodeOption>
						<VSCodeOption value="csv">CSV (.csv)</VSCodeOption>
					</VSCodeDropdown>
				</div>
			)}

			{/* Export Button */}
			<VSCodeButton onClick={handleExport} disabled={isExporting}>
				{isExporting ? "Exporting..." : "Export"}
			</VSCodeButton>

			{/* Error */}
			{error && (
				<div className="flex items-center gap-[8px] p-[8px] bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-testing-iconFailed)] rounded">
					<span className="codicon codicon-error text-[var(--vscode-testing-iconFailed)]" />
					<span className="text-[12px] text-[var(--vscode-foreground)]">{error}</span>
				</div>
			)}

			{/* Last Export Info */}
			{lastExport && (
				<div className="flex items-center gap-[8px] p-[8px] bg-[var(--vscode-inputValidation-infoBackground)] border border-[var(--vscode-focusBorder)] rounded">
					<span className="codicon codicon-check text-[var(--vscode-testing-iconPassed)]" />
					<span className="text-[12px] text-[var(--vscode-foreground)]">
						Last export: {new Date(lastExport).toLocaleString()}
					</span>
				</div>
			)}

			{/* Export Info */}
			<div className="flex flex-col gap-[8px] p-[12px] border border-[var(--vscode-panel-border)] rounded text-[12px] text-[var(--vscode-descriptionForeground)]">
				<h4 className="text-[12px] text-[var(--vscode-foreground)] m-0">Export Contents</h4>
				<ul className="m-0 pl-[16px]">
					<li>
						<strong>Traceability Matrix:</strong> Requirements linked to source code and tests
					</li>
					<li>
						<strong>Audit Log:</strong> Complete history of AI generations and human decisions
					</li>
					<li>
						<strong>Verification Package:</strong> All exports bundled for auditor submission
					</li>
				</ul>
			</div>
		</div>
	)
}

export default memo(ExportPanel)
