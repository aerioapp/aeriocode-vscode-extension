import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { memo, useMemo, useState } from "react"
import { definedRuleCount } from "@shared/compliance-coverage"
import {
	OpenComplianceFindingRequest,
	type ComplianceCheckResponse,
	type ComplianceFinding,
} from "@shared/proto/aeriocode/compliance"
import { ComplianceServiceClient } from "@/services/grpc-client"

type ComplianceResultsProps = {
	result: ComplianceCheckResponse
}

function severityColor(finding: ComplianceFinding): string {
	if (!finding.mandatory) {
		return "var(--vscode-descriptionForeground)"
	}
	return finding.confidence === "high" ? "var(--vscode-testing-iconFailed)" : "var(--vscode-editorWarning-foreground)"
}

const ComplianceResults = ({ result }: ComplianceResultsProps) => {
	const [expanded, setExpanded] = useState<string | null>(null)
	const summary = result.summary

	const byFile = useMemo(() => {
		const groups = new Map<string, ComplianceFinding[]>()
		for (const finding of result.findings) {
			const bucket = groups.get(finding.file)
			if (bucket) {
				bucket.push(finding)
			} else {
				groups.set(finding.file, [finding])
			}
		}
		return [...groups.entries()].sort((left, right) => left[0].localeCompare(right[0]))
	}, [result.findings])

	const openAt = (finding: ComplianceFinding) => {
		ComplianceServiceClient.openComplianceFinding(
			OpenComplianceFindingRequest.create({ path: finding.file, line: finding.line }),
		).catch((error) => console.error("Failed to open file:", error))
	}

	if (!summary) {
		return null
	}

	return (
		<div className="flex flex-col gap-[10px]">
			{/* Verdict */}
			<div className="p-[10px] border border-[var(--vscode-panel-border)] rounded bg-[var(--vscode-sideBar-background)]">
				<div className="flex items-center gap-[8px]">
					<span
						className={`codicon ${summary.mandatoryClean ? "codicon-pass" : "codicon-error"}`}
						style={{
							color: summary.mandatoryClean
								? "var(--vscode-testing-iconPassed)"
								: "var(--vscode-testing-iconFailed)",
						}}
					/>
					<span className="text-[13px] text-[var(--vscode-foreground)] font-medium">
						{summary.mandatoryClean
							? `No mandatory violations in ${summary.filesAnalyzed} file(s)`
							: `${summary.mandatoryViolations} mandatory violation(s) in ${summary.filesAnalyzed} file(s)`}
					</span>
				</div>

				{summary.scoreTenths >= 0 && (
					<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[6px]">
						Score {(summary.scoreTenths / 10).toFixed(1)}% — {summary.scoreDefinition}
					</p>
				)}

				{/* Coverage is stated on every result. "No violations" across a subset of rules
				    is not conformance, and the panel must never let it read as though it were. */}
				<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[6px]">
					{summary.rulesAutomated} of {definedRuleCount(summary.rulesAutomated, summary.rulesManualReview)} rules
					checked automatically. {summary.rulesManualReview} require manual review and were <strong>not</strong>{" "}
					evaluated.
				</p>

				{summary.truncated && (
					<p className="text-[11px] text-[var(--vscode-editorWarning-foreground)] m-0 mt-[6px]">
						Only {summary.returnedFindings} of {summary.totalFindings} findings are shown. Fix these and run the check
						again to see the rest.
					</p>
				)}
			</div>

			{/* Notes */}
			{result.parseErrors.length > 0 && (
				<div className="text-[11px] text-[var(--vscode-editorWarning-foreground)]">
					{result.parseErrors.map((note) => (
						<div key={note.path}>
							{note.path}: {note.reason}
						</div>
					))}
				</div>
			)}
			{result.skipped.length > 0 && (
				<div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
					{result.skipped.map((note) => (
						<div key={note.path}>
							Not analyzed — {note.path}: {note.reason}
						</div>
					))}
				</div>
			)}

			{/* Findings */}
			{byFile.map(([file, findings]) => (
				<div key={file} className="flex flex-col gap-[2px]">
					<span className="text-[11px] text-[var(--vscode-descriptionForeground)] mt-[4px]">
						{file} — {findings.length} finding(s)
					</span>

					{findings.map((finding, index) => {
						const key = `${file}:${finding.line}:${finding.ruleId}:${index}`
						const isOpen = expanded === key

						return (
							<div key={key} className="border border-[var(--vscode-panel-border)] rounded px-[8px] py-[6px]">
								<div className="flex items-start gap-[8px]">
									<span
										className="text-[11px] font-medium whitespace-nowrap"
										style={{ color: severityColor(finding) }}>
										AV {finding.ruleId}
									</span>
									<div className="flex-grow min-w-0">
										<div className="text-[12px] text-[var(--vscode-foreground)]">{finding.message}</div>
										<div className="flex items-center gap-[8px] mt-[2px]">
											<VSCodeLink className="text-[10px]" onClick={() => openAt(finding)}>
												line {finding.line}
											</VSCodeLink>
											<span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
												{finding.severity}
											</span>
											{finding.confidence !== "high" && (
												<span className="text-[10px] text-[var(--vscode-editorWarning-foreground)]">
													needs review ({finding.confidence} confidence)
												</span>
											)}
											{finding.fixable && (
												<span className="text-[10px] text-[var(--vscode-testing-iconPassed)]">
													autofix: {finding.fixable}
												</span>
											)}
											{finding.ruleStatement && (
												<VSCodeLink
													className="text-[10px]"
													onClick={() => setExpanded(isOpen ? null : key)}>
													{isOpen ? "hide rule" : "show rule"}
												</VSCodeLink>
											)}
										</div>

										{isOpen && (
											<div className="mt-[6px] text-[11px] text-[var(--vscode-descriptionForeground)]">
												<div>{finding.ruleStatement}</div>
												{finding.ruleRationale && (
													<div className="mt-[4px] italic">{finding.ruleRationale}</div>
												)}
											</div>
										)}
									</div>
								</div>
							</div>
						)
					})}
				</div>
			))}
		</div>
	)
}

export default memo(ComplianceResults)
