import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { AuditQueryRequest } from "@shared/proto/aeriocode/certification"

type Generation = {
	generationId: string
	modelId: string
	userMessage: string
	filesWritten: string[]
	timestamp: string
	decision: string
}

const GenerationHistory = () => {
	const [generations, setGenerations] = useState<Generation[]>([])
	const [loading, setLoading] = useState(true)
	const [searchQuery, setSearchQuery] = useState("")
	const [expandedId, setExpandedId] = useState<string | null>(null)

	useEffect(() => {
		const fetchData = async () => {
			try {
				const response = await CertificationServiceClient.getGenerationHistory(AuditQueryRequest.create({}))
				setGenerations(response.generations || [])
			} catch (error) {
				console.error("Failed to fetch generation history:", error)
			} finally {
				setLoading(false)
			}
		}
		fetchData()
	}, [])

	const filtered = generations.filter(
		(gen) =>
			gen.generationId.toLowerCase().includes(searchQuery.toLowerCase()) ||
			gen.userMessage.toLowerCase().includes(searchQuery.toLowerCase()),
	)

	if (loading) {
		return (
			<div className="flex justify-center items-center py-[40px] text-[var(--vscode-descriptionForeground)]">
				<span className="codicon codicon-loading codicon-modifier-spin" /> Loading...
			</div>
		)
	}

	if (generations.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-[40px] text-[var(--vscode-descriptionForeground)]">
				<span className="codicon codicon-history codicon-lg mb-[8px] text-[24px]" />
				<p className="text-[13px] m-0">No AI generations recorded</p>
				<p className="text-[11px] m-0 mt-[4px]">Generation history will appear here as you use AI assistance</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-[8px]">
			<VSCodeTextField
				placeholder="Search generations..."
				value={searchQuery}
				onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
				className="mb-[8px]"
			/>

			<div className="flex flex-col gap-[4px]">
				{filtered.map((gen) => (
					<div key={gen.generationId} className="border border-[var(--vscode-panel-border)] rounded overflow-hidden">
						<div
							className="flex items-center gap-[8px] p-[8px] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
							onClick={() => setExpandedId(expandedId === gen.generationId ? null : gen.generationId)}>
							<span className={`codicon codicon-chevron-${expandedId === gen.generationId ? "down" : "right"}`} />
							<div className="flex flex-col flex-grow min-w-0">
								<div className="flex items-center gap-[6px]">
									<span className="text-[12px] text-[var(--vscode-foreground)] font-medium">{gen.modelId}</span>
									{gen.decision && (
										<span
											className={`text-[10px] px-[4px] py-[1px] rounded ${
												gen.decision === "accepted"
													? "bg-[var(--vscode-testing-iconPassed)]20 text-[var(--vscode-testing-iconPassed)]"
													: gen.decision === "rejected"
														? "bg-[var(--vscode-testing-iconFailed)]20 text-[var(--vscode-testing-iconFailed)]"
														: "bg-[var(--vscode-charts-yellow)]20 text-[var(--vscode-charts-yellow)]"
											}`}>
											{gen.decision}
										</span>
									)}
								</div>
								<span className="text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
									{gen.userMessage}
								</span>
							</div>
							<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
								{new Date(gen.timestamp).toLocaleString()}
							</span>
						</div>
						{expandedId === gen.generationId && (
							<div className="p-[8px] border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
								<div className="flex flex-col gap-[4px]">
									<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
										Files modified:
									</span>
									{gen.filesWritten.map((file, i) => (
										<span key={i} className="text-[11px] text-[var(--vscode-foreground)] pl-[12px]">
											{file}
										</span>
									))}
								</div>
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	)
}

export default memo(GenerationHistory)
