import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { memo, useState } from "react"
import ProfileSelector from "./ProfileSelector"

type ProfileSetupProps = {
	onSetup: (standard: string, level: string) => void
	onSkip: () => void
}

const ProfileSetup = ({ onSetup, onSkip }: ProfileSetupProps) => {
	const [step, setStep] = useState<"welcome" | "select">("welcome")

	if (step === "select") {
		return (
			<div className="fixed inset-0 flex flex-col overflow-hidden pt-[10px] pl-[20px]">
				<div className="flex justify-between items-center mb-[17px] pr-[17px]">
					<h3 className="text-[var(--vscode-foreground)] m-0">Profile Setup</h3>
				</div>
				<div className="flex-grow overflow-auto pr-[8px]">
					<ProfileSelector
						currentStandard={null}
						currentLevel={null}
						onSelect={onSetup}
						onCancel={() => setStep("welcome")}
					/>
				</div>
			</div>
		)
	}

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden pt-[10px] pl-[20px]">
			<div className="flex justify-between items-center mb-[17px] pr-[17px]">
				<h3 className="text-[var(--vscode-foreground)] m-0">Certification Setup</h3>
			</div>
			<div className="flex-grow overflow-auto pr-[8px] flex flex-col items-center justify-center gap-[16px]">
				<div className="flex flex-col items-center gap-[8px] text-center">
					<span className="codicon codicon-shield codicon-lg text-[48px] text-[var(--vscode-focusBorder)]" />
					<h2 className="text-[16px] text-[var(--vscode-foreground)] m-0">Enable Certification Features</h2>
					<p className="text-[13px] text-[var(--vscode-descriptionForeground)] m-0 max-w-[400px]">
						AerioCode can help you comply with DO-178C and other safety standards by providing requirement
						traceability, audit trails, and compliance checks.
					</p>
				</div>

				<div className="flex flex-col gap-[8px] w-full max-w-[400px]">
					<div className="flex items-start gap-[8px] p-[12px] border border-[var(--vscode-panel-border)] rounded">
						<span className="codicon codicon-link text-[var(--vscode-focusBorder)] mt-[2px]" />
						<div>
							<span className="text-[12px] text-[var(--vscode-foreground)] font-medium">
								Requirement Traceability
							</span>
							<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[2px]">
								Link code to requirements with automatic REQ tag detection
							</p>
						</div>
					</div>
					<div className="flex items-start gap-[8px] p-[12px] border border-[var(--vscode-panel-border)] rounded">
						<span className="codicon codicon-history text-[var(--vscode-focusBorder)] mt-[2px]" />
						<div>
							<span className="text-[12px] text-[var(--vscode-foreground)] font-medium">Immutable Audit Trail</span>
							<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[2px]">
								Tamper-evident log of all AI generations and human decisions
							</p>
						</div>
					</div>
					<div className="flex items-start gap-[8px] p-[12px] border border-[var(--vscode-panel-border)] rounded">
						<span className="codicon codicon-export text-[var(--vscode-focusBorder)] mt-[2px]" />
						<div>
							<span className="text-[12px] text-[var(--vscode-foreground)] font-medium">Audit-Ready Exports</span>
							<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[2px]">
								Export traceability matrices and audit logs for auditor submission
							</p>
						</div>
					</div>
				</div>

				<div className="flex gap-[8px] mt-[8px]">
					<VSCodeButton appearance="secondary" onClick={onSkip}>
						Skip for Now
					</VSCodeButton>
					<VSCodeButton onClick={() => setStep("select")}>Get Started</VSCodeButton>
				</div>

				<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 text-center max-w-[400px]">
					All data stays local on your system. No certification data is sent to any server.
				</p>
			</div>
		</div>
	)
}

export default memo(ProfileSetup)
