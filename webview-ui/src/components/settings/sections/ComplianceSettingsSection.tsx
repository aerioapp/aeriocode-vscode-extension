import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { memo, useEffect, useState } from "react"
import { ComplianceServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import type { ComplianceStandard } from "@shared/proto/aeriocode/compliance"
import Section from "../Section"

interface ComplianceSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const ComplianceSettingsSection = ({ renderSectionHeader }: ComplianceSettingsSectionProps) => {
	const { navigateToCompliance } = useExtensionState()
	const [standards, setStandards] = useState<ComplianceStandard[]>([])
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(true)
	const [clearing, setClearing] = useState(false)

	useEffect(() => {
		let cancelled = false

		ComplianceServiceClient.getComplianceStandards(EmptyRequest.create({}))
			.then((response) => {
				if (cancelled) {
					return
				}
				setStandards(response.standards)
				setError(response.error)
			})
			.catch((requestError) => {
				if (!cancelled) {
					setError(requestError?.message ?? "Could not load compliance standards.")
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false)
				}
			})

		return () => {
			cancelled = true
		}
	}, [])

	const handleClear = async () => {
		setClearing(true)
		try {
			await ComplianceServiceClient.clearComplianceDiagnostics(EmptyRequest.create({}))
		} catch (requestError) {
			console.error("Failed to clear compliance diagnostics:", requestError)
		} finally {
			setClearing(false)
		}
	}

	return (
		<div>
			{renderSectionHeader("compliance")}
			<Section>
				<div style={{ marginBottom: 16 }}>
					<h4 className="text-[var(--vscode-foreground)] m-0 mb-2">Coding Standard Compliance</h4>
					<p className="text-[12px] text-[var(--vscode-descriptionForeground)] m-0 mb-4">
						Check source files against a coding standard and see exactly which rules were evaluated. Analysis runs on
						Aerio and requires a signed-in account.
					</p>

					{loading ? (
						<p className="text-[12px] text-[var(--vscode-descriptionForeground)] m-0">Loading standards…</p>
					) : error ? (
						<div className="flex items-center gap-2 p-3 border border-[var(--vscode-panel-border)] rounded mb-3">
							<span className="codicon codicon-warning text-[var(--vscode-editorWarning-foreground)]" />
							<span className="text-[12px] text-[var(--vscode-descriptionForeground)]">{error}</span>
						</div>
					) : (
						<div className="flex flex-col gap-2 mb-3">
							{standards.map((standard) => (
								<div
									key={standard.id}
									className="flex items-start gap-2 p-3 border border-[var(--vscode-panel-border)] rounded">
									<span className="codicon codicon-symbol-ruler text-[var(--vscode-focusBorder)] mt-[2px]" />
									<div>
										<span className="text-[13px] text-[var(--vscode-foreground)] font-medium">
											{standard.name}
										</span>
										<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-1">
											{standard.title}
										</p>
										{/* Coverage is stated wherever a standard is named, so nobody reads
										    "supported" as "fully automated". */}
										<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-1">
											{standard.version} — {standard.rulesAutomated} of {standard.rulesTotal} rules checked
											automatically, {standard.rulesManualReview} need manual review.
										</p>
									</div>
								</div>
							))}
						</div>
					)}

					<div className="flex flex-col gap-2">
						<VSCodeButton onClick={navigateToCompliance}>Open Compliance Check</VSCodeButton>
						<VSCodeButton appearance="secondary" onClick={handleClear} disabled={clearing}>
							{clearing ? "Clearing…" : "Clear Compliance Diagnostics"}
						</VSCodeButton>
					</div>
				</div>
			</Section>
		</div>
	)
}

export default memo(ComplianceSettingsSection)
