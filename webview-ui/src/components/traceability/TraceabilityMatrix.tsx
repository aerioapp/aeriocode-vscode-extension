import { VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"

type MatrixRow = {
	requirementId: string
	requirementLevel: string
	title: string
	dalLevel: string
	linkedSourceFiles: string[]
	linkedTestFiles: string[]
	coveragePercent: number
}

const TraceabilityMatrix = () => {
	const [rows, setRows] = useState<MatrixRow[]>([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const fetchData = async () => {
			try {
				const response = await CertificationServiceClient.getTraceabilityMatrix(EmptyRequest.create({}))
				setRows(response.rows || [])
			} catch (error) {
				console.error("Failed to fetch traceability matrix:", error)
			} finally {
				setLoading(false)
			}
		}
		fetchData()
	}, [])

	if (loading) {
		return (
			<div className="flex justify-center items-center py-[40px] text-[var(--vscode-descriptionForeground)]">
				<span className="codicon codicon-loading codicon-modifier-spin" /> Loading...
			</div>
		)
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-[40px] text-[var(--vscode-descriptionForeground)]">
				<span className="codicon codicon-table codicon-lg mb-[8px] text-[24px]" />
				<p className="text-[13px] m-0">No traceability data yet</p>
				<p className="text-[11px] m-0 mt-[4px]">Import requirements or add REQ tags to your code to build the matrix</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-[8px]">
			<div className="flex justify-between items-center mb-[8px]">
				<span className="text-[12px] text-[var(--vscode-descriptionForeground)]">{rows.length} requirements</span>
			</div>
			<VSCodeDataGrid>
				<VSCodeDataGridRow row-type="header">
					<VSCodeDataGridCell cell-type="columnheader" grid-column="1">
						Requirement ID
					</VSCodeDataGridCell>
					<VSCodeDataGridCell cell-type="columnheader" grid-column="2">
						Level
					</VSCodeDataGridCell>
					<VSCodeDataGridCell cell-type="columnheader" grid-column="3">
						DAL
					</VSCodeDataGridCell>
					<VSCodeDataGridCell cell-type="columnheader" grid-column="4">
						Linked Files
					</VSCodeDataGridCell>
					<VSCodeDataGridCell cell-type="columnheader" grid-column="5">
						Coverage
					</VSCodeDataGridCell>
				</VSCodeDataGridRow>
				{rows.map((row) => (
					<VSCodeDataGridRow key={row.requirementId}>
						<VSCodeDataGridCell grid-column="1">{row.requirementId}</VSCodeDataGridCell>
						<VSCodeDataGridCell grid-column="2">{row.requirementLevel}</VSCodeDataGridCell>
						<VSCodeDataGridCell grid-column="3">{row.dalLevel || "-"}</VSCodeDataGridCell>
						<VSCodeDataGridCell grid-column="4">
							{row.linkedSourceFiles.length + row.linkedTestFiles.length}
						</VSCodeDataGridCell>
						<VSCodeDataGridCell grid-column="5">
							<span
								style={{
									color:
										row.coveragePercent >= 80
											? "var(--vscode-testing-iconPassed)"
											: row.coveragePercent >= 50
												? "var(--vscode-charts-yellow)"
												: "var(--vscode-testing-iconFailed)",
								}}>
								{row.coveragePercent}%
							</span>
						</VSCodeDataGridCell>
					</VSCodeDataGridRow>
				))}
			</VSCodeDataGrid>
		</div>
	)
}

export default memo(TraceabilityMatrix)
