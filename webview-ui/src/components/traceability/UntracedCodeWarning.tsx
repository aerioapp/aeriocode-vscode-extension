import { memo, useEffect, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"

type UntracedFunction = {
	name: string
	startLine: number
	endLine: number
	filePath: string
	language: string
}

const UntracedCodeWarning = () => {
	const [functions, setFunctions] = useState<UntracedFunction[]>([])
	const [loading, setLoading] = useState(true)
	const [hasRequirements, setHasRequirements] = useState(true)

	useEffect(() => {
		const fetchData = async () => {
			try {
				// Check if any requirements exist
				const reqsResponse = await CertificationServiceClient.getRequirements(EmptyRequest.create({}))
				const hasReqs = (reqsResponse.requirements || []).length > 0
				setHasRequirements(hasReqs)

				if (hasReqs) {
					const response = await CertificationServiceClient.getUntracedCode(EmptyRequest.create({}))
					setFunctions(response.functions || [])
				}
			} catch (error) {
				console.error("Failed to fetch untraced code:", error)
			} finally {
				setLoading(false)
			}
		}
		fetchData()
	}, [])

	if (loading) {
		return (
			<div className="flex items-center justify-center py-[40px]">
				<span className="codicon codicon-loading codicon-modifier-spin" />
			</div>
		)
	}

	if (!hasRequirements) {
		return (
			<div className="flex flex-col items-center justify-center py-[40px] text-[var(--vscode-descriptionForeground)]">
				<span className="codicon codicon-list-flat codicon-lg mb-[8px] text-[24px]" />
				<p className="text-[13px] m-0">No requirements defined yet</p>
				<p className="text-[11px] m-0 mt-[4px]">
					Add requirements in the Requirements tab, then add REQ tags to your source code
				</p>
			</div>
		)
	}

	if (functions.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-[40px] text-[var(--vscode-descriptionForeground)]">
				<span className="codicon codicon-check codicon-lg mb-[8px] text-[24px] text-[var(--vscode-testing-iconPassed)]" />
				<p className="text-[13px] m-0">All functions are traced</p>
				<p className="text-[11px] m-0 mt-[4px]">No untraced code detected</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-[8px]">
			<div className="flex items-center gap-[8px] mb-[8px] p-[8px] bg-[var(--vscode-inputValidation-warningBackground)] border border-[var(--vscode-charts-yellow)] rounded">
				<span className="codicon codicon-warning" />
				<span className="text-[12px] text-[var(--vscode-foreground)]">
					{functions.length} untraced function(s) found. DO-178C requires all code to be linked to requirements.
				</span>
			</div>
			{functions.map((func, index) => (
				<div
					key={index}
					className="flex items-center gap-[8px] p-[8px] border border-[var(--vscode-panel-border)] rounded hover:bg-[var(--vscode-list-hoverBackground)]">
					<span className="codicon codicon-warning text-[var(--vscode-charts-yellow)]" />
					<div className="flex flex-col flex-grow">
						<span className="text-[12px] text-[var(--vscode-foreground)] font-medium">{func.name}</span>
						<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
							{func.filePath}:{func.startLine}-{func.endLine}
						</span>
					</div>
					<span className="text-[10px] text-[var(--vscode-descriptionForeground)] px-[4px] py-[2px] bg-[var(--vscode-badge-background)] rounded">
						{func.language}
					</span>
				</div>
			))}
		</div>
	)
}

export default memo(UntracedCodeWarning)
