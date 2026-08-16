import { VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import type { TraceabilityDirectionSummary, TraceabilityMatrixRow } from "@shared/proto/aeriocode/certification"

/**
 * The traceability matrix, showing both directions DO-178C 11.21 requires.
 *
 * ⚠️ The Coverage column used to show a percentage, and it was always 100 or 0 — the backend
 * computed it from whether a requirement had *any* link, so a requirement with a design document
 * attached and no implementing code showed green at 100%. Implemented and Verified are separate
 * columns now because they are separate objectives (Table A-4 objective 6, Table A-5 objective 5)
 * and a programme can satisfy one and not the other.
 */
/**
 * ⚠️ The generated proto types, not hand-written copies of them.
 *
 * These were declared locally and the response was `as`-cast onto them, which meant the cast
 * suppressed exactly the error the generated types exist to raise: rename or drop a proto field and
 * this file goes on compiling and renders `undefined`. `coverage_percent` had just been removed from
 * the wire for being meaningless, so this is a live risk rather than a hypothetical one.
 */
type MatrixRow = TraceabilityMatrixRow
type DirectionSummary = TraceabilityDirectionSummary

/**
 * How many orphaned ids to name before summarising the rest.
 *
 * An unbounded `join(", ")` is fine on the project this was written against and is not fine on one
 * that renamed a requirement prefix: every tag in the tree becomes orphaned at once, and the panel
 * renders a single paragraph thousands of ids long.
 */
const ORPHAN_IDS_SHOWN = 20

const Marker = ({ met, label }: { met: boolean; label: string }) => (
	<span
		title={label}
		style={{ color: met ? "var(--vscode-testing-iconPassed)" : "var(--vscode-testing-iconFailed)" }}
		className={`codicon codicon-${met ? "pass" : "circle-slash"}`}
	/>
)

const TraceabilityMatrix = () => {
	const [rows, setRows] = useState<MatrixRow[]>([])
	const [summary, setSummary] = useState<DirectionSummary | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const fetchData = async () => {
			try {
				const response = await CertificationServiceClient.getTraceabilityMatrix(EmptyRequest.create({}))
				setRows(response.rows || [])
				setSummary(response.summary ?? null)
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
			{summary && (
				<div className="flex flex-col gap-[4px] mb-[8px]">
					<span className="text-[12px]">
						{summary.implemented}/{summary.requirements} implemented &middot; {summary.verified}/
						{summary.requirements} verified
					</span>
					{summary.orphanedTagRequirementIds.length > 0 && (
						<span className="text-[11px] break-words" style={{ color: "var(--vscode-testing-iconFailed)" }}>
							{summary.orphanedTagRequirementIds.length} tag(s) name a requirement that is not in the baseline:{" "}
							{summary.orphanedTagRequirementIds.slice(0, ORPHAN_IDS_SHOWN).join(", ")}
							{summary.orphanedTagRequirementIds.length > ORPHAN_IDS_SHOWN &&
								` and ${summary.orphanedTagRequirementIds.length - ORPHAN_IDS_SHOWN} more`}
						</span>
					)}
					<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">{summary.statement}</span>
				</div>
			)}
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
						Implemented
					</VSCodeDataGridCell>
					<VSCodeDataGridCell cell-type="columnheader" grid-column="6">
						Verified
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
							<Marker
								met={row.implemented}
								label={row.implemented ? "Has implementing code" : "No implementing code"}
							/>
						</VSCodeDataGridCell>
						<VSCodeDataGridCell grid-column="6">
							<Marker met={row.verified} label={row.verified ? "Has a linked test" : "No linked test"} />
						</VSCodeDataGridCell>
					</VSCodeDataGridRow>
				))}
			</VSCodeDataGrid>
		</div>
	)
}

export default memo(TraceabilityMatrix)
