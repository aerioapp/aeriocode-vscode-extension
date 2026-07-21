import { VSCodeButton, VSCodeDivider } from "@vscode/webview-ui-toolkit/react"
import { memo, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { AddTraceLinkRequest } from "@shared/proto/aeriocode/certification"
import LinkEditor from "./LinkEditor"

type RequirementDetailProps = {
	requirement_id: string
	title: string
	description: string
	level: string
	dal_level: string | null
	status: string
	linked_files: Array<{ path: string; line: number; type: string }>
	onBack: () => void
	onLinkAdded: () => void
}

const RequirementDetail = ({
	requirement_id,
	title,
	description,
	level,
	dal_level,
	status,
	linked_files,
	onBack,
	onLinkAdded,
}: RequirementDetailProps) => {
	const [showLinkEditor, setShowLinkEditor] = useState(false)

	const handleSaveLink = async (link: { requirement_id: string; artifact_path: string; link_type: string }) => {
		try {
			await CertificationServiceClient.addTraceLink(
				AddTraceLinkRequest.create({
					requirementId: link.requirement_id,
					artifactType: "source_code",
					artifactPath: link.artifact_path,
					linkType: link.link_type,
				}),
			)
			setShowLinkEditor(false)
			onLinkAdded()
		} catch (error) {
			console.error("Failed to add trace link:", error)
		}
	}

	return (
		<div className="flex flex-col gap-[12px]">
			<div className="flex items-center gap-[8px]">
				<VSCodeButton appearance="icon" onClick={onBack}>
					<span className="codicon codicon-arrow-left" />
				</VSCodeButton>
				<h3 className="text-[14px] text-[var(--vscode-foreground)] m-0">{requirement_id}</h3>
			</div>

			<div className="flex flex-col gap-[8px] p-[12px] border border-[var(--vscode-panel-border)] rounded">
				<div className="flex items-center gap-[8px]">
					<span className="text-[12px] text-[var(--vscode-descriptionForeground)]">Level:</span>
					<span className="text-[12px] text-[var(--vscode-foreground)]">{level}</span>
					{dal_level && (
						<span className="text-[10px] px-[4px] py-[1px] bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
							{dal_level}
						</span>
					)}
					<span
						className={`text-[10px] px-[4px] py-[1px] rounded ${status === "active" ? "bg-[var(--vscode-testing-iconPassed)]20 text-[var(--vscode-testing-iconPassed)]" : "bg-[var(--vscode-testing-iconFailed)]20 text-[var(--vscode-testing-iconFailed)]"}`}>
						{status}
					</span>
				</div>
				<h4 className="text-[13px] text-[var(--vscode-foreground)] m-0">{title}</h4>
				{description && <p className="text-[12px] text-[var(--vscode-descriptionForeground)] m-0">{description}</p>}
			</div>

			<VSCodeDivider />

			<div className="flex flex-col gap-[6px]">
				<div className="flex items-center justify-between">
					<h4 className="text-[12px] text-[var(--vscode-foreground)] m-0">Linked Artifacts ({linked_files.length})</h4>
					<VSCodeButton appearance="secondary" onClick={() => setShowLinkEditor(!showLinkEditor)}>
						<span className={`codicon ${showLinkEditor ? "codicon-close" : "codicon-add"} mr-[4px]`} />
						{showLinkEditor ? "Cancel" : "Add Link"}
					</VSCodeButton>
				</div>

				{showLinkEditor && (
					<LinkEditor
						requirement_id={requirement_id}
						onSave={handleSaveLink}
						onCancel={() => setShowLinkEditor(false)}
					/>
				)}

				{linked_files.length === 0 && !showLinkEditor ? (
					<p className="text-[12px] text-[var(--vscode-descriptionForeground)] m-0">No linked artifacts</p>
				) : (
					linked_files.map((file, index) => (
						<div
							key={index}
							className="flex items-center gap-[8px] p-[6px] border border-[var(--vscode-panel-border)] rounded hover:bg-[var(--vscode-list-hoverBackground)]">
							<span className="codicon codicon-file" />
							<span className="text-[12px] text-[var(--vscode-foreground)] flex-grow truncate">{file.path}</span>
							{file.line > 0 && (
								<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">L{file.line}</span>
							)}
							<span className="text-[10px] px-[4px] py-[1px] bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
								{file.type}
							</span>
						</div>
					))
				)}
			</div>
		</div>
	)
}

export default memo(RequirementDetail)
