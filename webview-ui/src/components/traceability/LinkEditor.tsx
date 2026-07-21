import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { memo, useState } from "react"

type LinkEditorProps = {
	requirement_id?: string
	artifact_path?: string
	onSave: (link: { requirement_id: string; artifact_path: string; link_type: string }) => void
	onCancel: () => void
}

const LinkEditor = ({ requirement_id, artifact_path, onSave, onCancel }: LinkEditorProps) => {
	const [reqId, setReqId] = useState(requirement_id || "")
	const [filePath, setFilePath] = useState(artifact_path || "")
	const [linkType, setLinkType] = useState("implements")

	const handleSave = () => {
		if (reqId && filePath) {
			onSave({ requirement_id: reqId, artifact_path: filePath, link_type: linkType })
		}
	}

	return (
		<div className="flex flex-col gap-[8px] p-[12px] border border-[var(--vscode-focusBorder)] rounded bg-[var(--vscode-editor-background)]">
			<h4 className="text-[12px] text-[var(--vscode-foreground)] m-0">Create Traceability Link</h4>

			<div className="flex flex-col gap-[4px]">
				<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Requirement ID</label>
				<VSCodeTextField
					placeholder="Must match an existing requirement ID exactly"
					value={reqId}
					onInput={(e) => setReqId((e.target as HTMLInputElement).value)}
				/>
			</div>

			<div className="flex flex-col gap-[4px]">
				<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Artifact Path</label>
				<VSCodeTextField
					placeholder="src/main.c"
					value={filePath}
					onInput={(e) => setFilePath((e.target as HTMLInputElement).value)}
				/>
			</div>

			<div className="flex flex-col gap-[4px]">
				<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Link Type</label>
				<VSCodeDropdown value={linkType} onChange={(e) => setLinkType((e.target as HTMLSelectElement).value)}>
					<VSCodeOption value="implements">Implements</VSCodeOption>
					<VSCodeOption value="tests">Tests</VSCodeOption>
					<VSCodeOption value="verifies">Verifies</VSCodeOption>
					<VSCodeOption value="derived_from">Derived From</VSCodeOption>
					<VSCodeOption value="trace_to">Trace To</VSCodeOption>
				</VSCodeDropdown>
			</div>

			<div className="flex gap-[8px] justify-end mt-[8px]">
				<VSCodeButton appearance="secondary" onClick={onCancel}>
					Cancel
				</VSCodeButton>
				<VSCodeButton onClick={handleSave} disabled={!reqId || !filePath}>
					Save Link
				</VSCodeButton>
			</div>
		</div>
	)
}

export default memo(LinkEditor)
