import { VSCodeCheckbox, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { memo } from "react"
import type { ComplianceFile } from "@shared/proto/aeriocode/compliance"

type ComplianceFileListProps = {
	files: ComplianceFile[]
	selected: Set<string>
	onToggle: (path: string) => void
	onSelectAll: () => void
	onSelectNone: () => void
	excludedOverLimit: number
	maxFiles: number
}

function formatSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`
	}
	if (bytes < 1024 * 1024) {
		return `${Math.round(bytes / 1024)} KB`
	}
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * The files that will be sent, as a checklist.
 *
 * Shown before the run rather than after because analysis uploads file contents to the
 * Aeriocode backend — the user should be able to answer "what am I about to send?" while
 * they can still change the answer.
 */
const ComplianceFileList = ({
	files,
	selected,
	onToggle,
	onSelectAll,
	onSelectNone,
	excludedOverLimit,
	maxFiles,
}: ComplianceFileListProps) => {
	const selectable = files.filter((file) => file.selectable)
	const selectedBytes = files
		.filter((file) => selected.has(file.path))
		.reduce((total, file) => total + Number(file.sizeBytes), 0)

	return (
		<div className="flex flex-col gap-[6px]">
			<div className="flex items-center justify-between">
				<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
					{selected.size} of {selectable.length} selected ({formatSize(selectedBytes)})
				</span>
				<div className="flex gap-[8px]">
					<VSCodeLink className="text-[11px]" onClick={onSelectAll}>
						All
					</VSCodeLink>
					<VSCodeLink className="text-[11px]" onClick={onSelectNone}>
						None
					</VSCodeLink>
				</div>
			</div>

			<div className="max-h-[220px] overflow-auto border border-[var(--vscode-panel-border)] rounded">
				{files.map((file) => (
					<div
						key={file.path}
						className="flex items-center gap-[8px] px-[8px] py-[4px] border-b border-[var(--vscode-panel-border)] last:border-b-0">
						<VSCodeCheckbox
							checked={selected.has(file.path)}
							disabled={!file.selectable}
							onChange={() => onToggle(file.path)}
						/>
						<span
							className={`flex-grow text-[12px] truncate ${
								file.selectable
									? "text-[var(--vscode-foreground)]"
									: "text-[var(--vscode-descriptionForeground)] line-through"
							}`}
							title={file.path}>
							{file.path}
						</span>
						<span className="text-[10px] text-[var(--vscode-descriptionForeground)] whitespace-nowrap">
							{file.selectable ? formatSize(Number(file.sizeBytes)) : file.blockedReason}
						</span>
					</div>
				))}
			</div>

			{excludedOverLimit > 0 && (
				<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
					{excludedOverLimit} more file(s) were left out — one check covers at most {maxFiles} files and 2 MB of source.
					Narrow the scope, or run a second check.
				</span>
			)}
		</div>
	)
}

export default memo(ComplianceFileList)
