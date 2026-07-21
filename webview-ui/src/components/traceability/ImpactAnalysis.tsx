import { memo } from "react"

type ImpactAnalysisProps = {
	requirement_id: string
	affected_files: Array<{ file_path: string; line_start: number; line_end: number; link_type: string }>
	cascading_requirements: string[]
}

const ImpactAnalysis = ({ requirement_id, affected_files, cascading_requirements }: ImpactAnalysisProps) => {
	return (
		<div className="flex flex-col gap-[12px]">
			<h4 className="text-[13px] text-[var(--vscode-foreground)] m-0">Impact Analysis: {requirement_id}</h4>

			{affected_files.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-[20px] text-[var(--vscode-descriptionForeground)]">
					<p className="text-[12px] m-0">No affected files</p>
				</div>
			) : (
				<div className="flex flex-col gap-[6px]">
					<h5 className="text-[12px] text-[var(--vscode-foreground)] m-0">Affected Code ({affected_files.length})</h5>
					{affected_files.map((file, index) => (
						<div
							key={index}
							className="flex items-center gap-[8px] p-[8px] border border-[var(--vscode-panel-border)] rounded">
							<span className="codicon codicon-file" />
							<div className="flex flex-col flex-grow min-w-0">
								<span className="text-[12px] text-[var(--vscode-foreground)] truncate">{file.file_path}</span>
								<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
									Lines {file.line_start}-{file.line_end} ({file.link_type})
								</span>
							</div>
						</div>
					))}
				</div>
			)}

			{cascading_requirements.length > 0 && (
				<div className="flex flex-col gap-[6px]">
					<h5 className="text-[12px] text-[var(--vscode-foreground)] m-0">
						Cascading Requirements ({cascading_requirements.length})
					</h5>
					<div className="flex flex-wrap gap-[4px]">
						{cascading_requirements.map((reqId) => (
							<span
								key={reqId}
								className="text-[11px] px-[6px] py-[2px] bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
								{reqId}
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	)
}

export default memo(ImpactAnalysis)
