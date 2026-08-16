import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { memo, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import Section from "../Section"
import RegimeStatusDashboard from "@/components/certification/RegimeStatusDashboard"
import { regimeForProfileStandard } from "@shared/compliance/regimes"

interface CertificationSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const CertificationSettingsSection = ({ renderSectionHeader }: CertificationSettingsSectionProps) => {
	const {
		certificationActive,
		certificationProfile,
		certificationLevel,
		certificationVersion,
		certificationTitle,
		navigateToProfileSetup,
		navigateToTraceability,
		navigateToAuditTrail,
		refreshCertificationStatus,
	} = useExtensionState()
	const [deactivating, setDeactivating] = useState(false)
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
	const [deleting, setDeleting] = useState(false)

	// Which regime the active profile belongs to, from the one table that knows. ECSS and NASA each
	// have a status view of their own shape; DO-178C's is the Annex A objective grid, which is not
	// this component.
	const regime = regimeForProfileStandard(certificationProfile)
	const regimeHasStatusView = regime === "ecss" || regime === "nasa"
	const statusViewTitle = regime === "ecss" ? "ECSS Annex R expected outputs" : "NPR 7150.2D Appendix C requirements"

	const handleDeactivate = async () => {
		setDeactivating(true)
		try {
			await CertificationServiceClient.deactivateProfile(EmptyRequest.create({}))
			await refreshCertificationStatus()
		} catch (error) {
			console.error("Failed to deactivate certification:", error)
		} finally {
			setDeactivating(false)
		}
	}

	const handleDeleteData = async () => {
		setDeleting(true)
		try {
			await CertificationServiceClient.deleteProjectData(EmptyRequest.create({}))
			await refreshCertificationStatus()
			setShowDeleteConfirm(false)
		} catch (error) {
			console.error("Failed to delete certification data:", error)
		} finally {
			setDeleting(false)
		}
	}

	return (
		<div>
			{renderSectionHeader("certification")}
			<Section>
				<div style={{ marginBottom: 16 }}>
					<h4 className="text-[var(--vscode-foreground)] m-0 mb-2">Certification Mode</h4>
					{/* ⚠️ This said "DO-178C only", which was true when written and stopped being true the
					    day ECSS and NASA profiles shipped — and it kept saying it, because the sentence and
					    the profile list had no connection to each other. The breadth claim now belongs to
					    `ProfileSelector`, which fetches the profiles; what stays here is the part that does
					    not change, namely which artifacts follow which regime. */}
					<p className="text-[12px] text-[var(--vscode-descriptionForeground)] m-0 mb-4">
						Requirements, traceability and a hash-chained audit trail, against the certification profile you activate
						— DO-178C, ECSS or NASA NPR 7150.2. All data stays local on your system.
					</p>
					<p className="text-[12px] text-[var(--vscode-descriptionForeground)] m-0 mb-4">
						This is separate from the coding standard, which is set per workspace from the shield beside the model
						name. Each regime is presented in the structure its own publisher uses: DO-178C in an objective table,
						ECSS in Annex R expected outputs, NPR 7150.2 in the Appendix C requirement matrix. Every profile lists
						what it produces and what it does not.
					</p>

					{certificationActive ? (
						<div className="flex flex-col gap-3">
							<div className="flex items-center gap-2 p-3 border border-[var(--vscode-focusBorder)] rounded bg-[var(--vscode-sideBar-background)]">
								<span className="codicon codicon-shield text-[var(--vscode-focusBorder)]" />
								<div>
									<span className="text-[13px] text-[var(--vscode-foreground)] font-medium">
										Certification Active
									</span>
									{/* ⚠️ The document, not the publisher. This rendered `certificationProfile`
									    alone, which was "ECSS" — a standards body with dozens of publications,
									    several of which bear on a space software programme. A supplier could
									    not tell from this screen whether they had been activated against
									    ECSS-E-ST-40C or anything else, and the same held for "NASA". */}
									<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-1">
										{certificationProfile}
										{certificationVersion ? ` ${certificationVersion}` : ""}
										{certificationLevel ? ` — ${certificationLevel}` : ""}
									</p>
									{certificationTitle && (
										<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[2px] italic">
											{certificationTitle}
										</p>
									)}
								</div>
							</div>

							<div className="flex gap-2">
								<VSCodeButton appearance="secondary" onClick={navigateToTraceability}>
									Open Traceability
								</VSCodeButton>
								<VSCodeButton appearance="secondary" onClick={navigateToAuditTrail}>
									Open Audit Trail
								</VSCodeButton>
							</div>

							{/* ⚠️ Rendered only for the regimes that have a view of their own. ECSS and NASA
							    shipped with profiles, applicability projections and backend status endpoints
							    and nothing in the panel that showed any of it — so a programme on either had
							    to take on trust that anything was happening. DO-178C programmes are not sent
							    through this: Annex A is an objective grid carrying independence marks, a third
							    shape again, and rendering it in an expected-output table would misstate it. */}
							{regimeHasStatusView && (
								<details className="border border-[var(--vscode-panel-border)] rounded p-2">
									<summary className="text-[12px] text-[var(--vscode-foreground)] cursor-pointer">
										{statusViewTitle}
									</summary>
									<div className="mt-3">
										<RegimeStatusDashboard
											profileLevel={certificationLevel}
											profileStandard={certificationProfile}
										/>
									</div>
								</details>
							)}

							<VSCodeButton appearance="secondary" onClick={navigateToProfileSetup}>
								Change Profile
							</VSCodeButton>
							<VSCodeButton appearance="secondary" onClick={handleDeactivate} disabled={deactivating}>
								{deactivating ? "Disabling..." : "Disable Certification"}
							</VSCodeButton>

							<div className="mt-2 pt-3 border-t border-[var(--vscode-panel-border)]">
								{showDeleteConfirm ? (
									<div className="flex flex-col gap-2 p-3 border border-[var(--vscode-testing-iconFailed)] rounded bg-[var(--vscode-inputValidation-errorBackground)]">
										<div className="flex items-center gap-2">
											<span className="codicon codicon-warning text-[var(--vscode-testing-iconFailed)]" />
											<span className="text-[13px] text-[var(--vscode-foreground)] font-medium">
												Permanently delete all certification data?
											</span>
										</div>
										<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0">
											This will permanently remove the database, audit trail, requirements, and all
											traceability data for this project. This action cannot be undone.
										</p>
										<div className="flex gap-2 mt-1">
											<VSCodeButton
												appearance="secondary"
												onClick={() => setShowDeleteConfirm(false)}
												disabled={deleting}>
												Cancel
											</VSCodeButton>
											<VSCodeButton onClick={handleDeleteData} disabled={deleting}>
												{deleting ? "Deleting..." : "Yes, Delete Everything"}
											</VSCodeButton>
										</div>
									</div>
								) : (
									<VSCodeButton appearance="secondary" onClick={() => setShowDeleteConfirm(true)}>
										Delete All Data
									</VSCodeButton>
								)}
							</div>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							<div className="flex items-center gap-2 p-3 border border-[var(--vscode-panel-border)] rounded">
								<span className="codicon codicon-shield text-[var(--vscode-descriptionForeground)]" />
								<div>
									<span className="text-[13px] text-[var(--vscode-foreground)]">
										Certification mode is not enabled
									</span>
									<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-1">
										Enable to access requirement traceability, audit trails, and compliance exports.
									</p>
								</div>
							</div>

							<VSCodeButton onClick={navigateToProfileSetup}>Enable Certification Mode</VSCodeButton>
						</div>
					)}
				</div>
			</Section>
		</div>
	)
}

export default memo(CertificationSettingsSection)
