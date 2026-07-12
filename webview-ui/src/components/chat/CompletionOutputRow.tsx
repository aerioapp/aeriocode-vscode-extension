import { memo } from "react"
import { cn } from "@/lib/utils"
import MarkdownBlock from "@/components/common/MarkdownBlock"
import { Int64Request } from "@shared/proto/aeriocode/common"
import { CheckIcon } from "lucide-react"
import { TaskServiceClient } from "@/services/grpc-client"
import { CopyButton } from "../common/CopyButton"
import SuccessButton from "../common/SuccessButton"

interface QuoteButtonState {
	visible: boolean
	top: number
	left: number
	selectedText: string
}

interface CompletionOutputRowProps {
	text: string
	quoteButtonState: QuoteButtonState
	handleQuoteClick: () => void
	headClassNames?: string
	showActionRow?: boolean
	seeNewChangesDisabled: boolean
	setSeeNewChangesDisabled: (value: boolean) => void
	messageTs: number
}

export const CompletionOutputRow = memo(
	({
		headClassNames,
		text,
		quoteButtonState,
		showActionRow,
		seeNewChangesDisabled,
		setSeeNewChangesDisabled,
		messageTs,
		handleQuoteClick,
	}: CompletionOutputRowProps) => {
		return (
			<div>
				<div className="rounded-sm border border-[var(--vscode-charts-green)]/20 overflow-visible bg-[var(--vscode-charts-green)]/10 p-2 pt-3">
					{/* Title */}
					<div className={cn(headClassNames, "justify-between px-1")}>
						<div className="flex gap-2 items-center">
							<CheckIcon className="size-3 text-[var(--vscode-charts-green)]" />
							<span className="text-[var(--vscode-charts-green)] font-bold">Task Completed</span>
						</div>
						<CopyButton className="text-[var(--vscode-charts-green)]" textToCopy={text} />
					</div>
					{/* Content */}
					<div className="w-full relative border-t-1 border-[var(--vscode-descriptionForeground)]/20 rounded-b-sm">
						<div className="completion-output-content p-2 pt-3 w-full [&_hr]:opacity-20 [&_p:last-child]:mb-0 rounded-sm">
							<MarkdownBlock markdown={text} />
						</div>
					</div>
				</div>
				{/* Action Buttons */}
				{showActionRow && (
					<CompletionOutputActionRow
						messageTs={messageTs}
						seeNewChangesDisabled={seeNewChangesDisabled}
						setSeeNewChangesDisabled={setSeeNewChangesDisabled}
					/>
				)}
			</div>
		)
	},
)

CompletionOutputRow.displayName = "CompletionOutputRow"

const CompletionOutputActionRow = memo(
	({
		seeNewChangesDisabled,
		setSeeNewChangesDisabled,
		messageTs,
	}: {
		seeNewChangesDisabled: boolean
		setSeeNewChangesDisabled: (value: boolean) => void
		messageTs: number
	}) => {
		return (
			<div style={{ paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
				<SuccessButton
					disabled={seeNewChangesDisabled}
					onClick={() => {
						setSeeNewChangesDisabled(true)
						TaskServiceClient.taskCompletionViewChanges(
							Int64Request.create({
								value: messageTs,
							}),
						).catch((err: any) => console.error("Failed to show task completion view changes:", err))
					}}
					style={{
						cursor: seeNewChangesDisabled ? "wait" : "pointer",
						width: "100%",
					}}>
					<i className="codicon codicon-new-file" style={{ marginRight: 6 }} />
					View Changes
				</SuccessButton>
			</div>
		)
	},
)
