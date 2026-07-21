import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { memo, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import Section from "../Section"

interface CertificationSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const CertificationSettingsSection = ({ renderSectionHeader }: CertificationSettingsSectionProps) => {
	const {
		certificationActive,
		certificationProfile,
		certificationLevel,
		navigateToProfileSetup,
		navigateToTraceability,
		navigateToAuditTrail,
		refreshCertificationStatus,
	} = useExtensionState()
	const [deactivating, setDeactivating] = useState(false)
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
	const [deleting, setDeleting] = useState(false)

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
					<p className="text-[12px] text-[var(--vscode-descriptionForeground)] m-0 mb-4">
						Enable certification features for DO-178C and other safety standards compliance. All data stays local on
						your system.
					</p>

					{certificationActive ? (
						<div className="flex flex-col gap-3">
							<div className="flex items-center gap-2 p-3 border border-[var(--vscode-focusBorder)] rounded bg-[var(--vscode-sideBar-background)]">
								<span className="codicon codicon-shield text-[var(--vscode-focusBorder)]" />
								<div>
									<span className="text-[13px] text-[var(--vscode-foreground)] font-medium">
										Certification Active
									</span>
									<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-1">
										{certificationProfile}
										{certificationLevel ? ` — ${certificationLevel}` : ""}
									</p>
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
