import { COMMAND_OUTPUT_STRING, COMMAND_REQ_APP_STRING } from "@shared/combineCommandSequences"
import { AeriocodeMessage } from "@shared/ExtensionMessage"
import { StringRequest } from "@shared/proto/aeriocode/common"
import { memo, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { FileServiceClient } from "@/services/grpc-client"
import CodeBlock from "../common/CodeBlock"

const ExpandHandle = memo(({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) => {
	return (
		<button
			onClick={onToggle}
			type="button"
			className="w-full flex items-center justify-center py-1 cursor-pointer bg-[var(--vscode-textCodeBlock-background)] border-none hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
			<span
				className={`codicon codicon-chevron-${isExpanded ? "up" : "down"} text-[var(--vscode-descriptionForeground)] text-xs`}
			/>
		</button>
	)
})
ExpandHandle.displayName = "ExpandHandle"

export const CommandOutputContent = memo(
	({
		output,
		isOutputFullyExpanded,
		onToggle,
		isContainerExpanded,
	}: {
		output: string
		isOutputFullyExpanded: boolean
		onToggle: () => void
		isContainerExpanded: boolean
	}) => {
		const outputLines = output.split("\n")
		const lineCount = outputLines.length
		const shouldAutoShow = lineCount <= 5
		const outputRef = useRef<HTMLDivElement>(null)

		useEffect(() => {
			if (!isOutputFullyExpanded && outputRef.current) {
				outputRef.current.scrollTop = outputRef.current.scrollHeight
				setTimeout(() => {
					if (outputRef.current) {
						outputRef.current.scrollTop = outputRef.current.scrollHeight
					}
				}, 50)
			}
		}, [output, isOutputFullyExpanded])

		if (!isContainerExpanded) {
			return null
		}

		const logFilePathMatch = output.match(/📋 Output is being logged to: ([^\n]+)/)
		const logFilePath = logFilePathMatch ? logFilePathMatch[1].trim() : null

		const renderOutput = () => {
			if (!logFilePath) {
				return <CodeBlock forceWrap={true} source={`${"```"}shell\n${output}\n${"```"}`} />
			}

			const logPathLineStart = output.indexOf("📋 Output is being logged to:")
			const logPathLineEnd = output.indexOf("\n", logPathLineStart)
			const beforeLogPath = output.substring(0, logPathLineStart)
			const afterLogPath = logPathLineEnd !== -1 ? output.substring(logPathLineEnd) : ""
			const fileName = logFilePath.split("/").pop() || logFilePath

			return (
				<div className="border border-[var(--vscode-editorGroup-border)] rounded-sm">
					{beforeLogPath && <CodeBlock forceWrap={true} source={`${"```"}shell\n${beforeLogPath}\n${"```"}`} />}
					<div
						className="flex flex-wrap items-center gap-1.5 px-3 py-2 mx-2 my-1.5 rounded-sm bg-[var(--vscode-textBlockQuote-background)] cursor-pointer hover:brightness-110 transition-colors"
						onClick={() => {
							FileServiceClient.openFile(StringRequest.create({ value: logFilePath })).catch((err) =>
								console.error("Failed to open log file:", err),
							)
						}}
						title={`Click to open: ${logFilePath}`}>
						<span className="shrink-0">📋 Output is being logged to:</span>
						<span className="text-[var(--vscode-textLink-foreground)] underline break-all">{fileName}</span>
					</div>
					{afterLogPath && <CodeBlock forceWrap={true} source={`${"```"}shell\n${afterLogPath}\n${"```"}`} />}
				</div>
			)
		}

		return (
			<div
				className={cn(
					"w-full relative pb-0 overflow-visible border-t border-[var(--vscode-editorGroup-border)] bg-[var(--vscode-textCodeBlock-background)] rounded-sm",
					{
						"rounded-b-none": lineCount > 5,
					},
				)}>
				<div
					className={cn("text-white scroll-smooth bg-[var(--vscode-textCodeBlock-background)] overflow-y-auto", {
						"max-h-[75px]": !shouldAutoShow && !isOutputFullyExpanded,
						"max-h-[200px]": !shouldAutoShow && isOutputFullyExpanded,
						"overflow-y-visible": shouldAutoShow,
					})}
					ref={outputRef}>
					<div className="bg-[var(--vscode-textCodeBlock-background)]">{renderOutput()}</div>
				</div>
				{lineCount > 5 && <ExpandHandle isExpanded={isOutputFullyExpanded} onToggle={onToggle} />}
			</div>
		)
	},
)

CommandOutputContent.displayName = "CommandOutputContent"

export const CommandOutputRow = memo(
	({
		message,
		isCommandExecuting = false,
		isCommandPending = false,
		isCommandCompleted = false,
		isBackgroundExec = false,
		onCancelCommand,
		icon,
		title,
		isOutputFullyExpanded,
		setIsOutputFullyExpanded,
	}: {
		message: AeriocodeMessage
		isCommandExecuting?: boolean
		isCommandPending?: boolean
		isCommandCompleted?: boolean
		isBackgroundExec?: boolean
		onCancelCommand?: () => void
		icon?: JSX.Element | null
		title?: JSX.Element | null
		isOutputFullyExpanded: boolean
		setIsOutputFullyExpanded: (expanded: boolean) => void
	}) => {
		const splitMessage = (text: string) => {
			const outputIndex = text.indexOf(COMMAND_OUTPUT_STRING)
			if (outputIndex === -1) {
				return { command: text, output: "" }
			}
			return {
				command: text.slice(0, outputIndex).trim(),
				output: text
					.slice(outputIndex + COMMAND_OUTPUT_STRING.length)
					.trim()
					.split("")
					.map((char) => {
						switch (char) {
							case "\t":
								return "→   "
							case "\b":
								return "⌫"
							case "\f":
								return "⏏"
							case "\v":
								return "⇳"
							default:
								return char
						}
					})
					.join(""),
			}
		}

		const { command: rawCommand, output } = splitMessage(message.text || "")

		const requestsApproval = rawCommand.endsWith(COMMAND_REQ_APP_STRING)
		const command = requestsApproval ? rawCommand.slice(0, -COMMAND_REQ_APP_STRING.length) : rawCommand
		const showCancelButton =
			(isCommandExecuting || isCommandPending) && typeof onCancelCommand === "function" && isBackgroundExec

		const commandHeader = (
			<div className="flex items-center gap-2.5 mb-3">
				{icon}
				{title}
			</div>
		)

		return (
			<>
				{commandHeader}
				<div
					className="bg-[var(--vscode-textCodeBlock-background)] rounded-sm border border-[var(--vscode-editorGroup-border)]"
					style={{
						transition: "all 0.3s ease-in-out",
					}}>
					{command && (
						<div className="bg-[var(--vscode-textCodeBlock-background)] flex items-center justify-between px-2 py-2.5 border-b border-[var(--vscode-editorGroup-border)] rounded-sm rounded-b-none overflow-hidden">
							<div className="flex items-center gap-2 flex-1 min-w-0">
								<div
									className={cn("bg-[var(--vscode-descriptionForeground)] rounded-full w-2 h-2 shrink-0", {
										"bg-[var(--vscode-charts-green)] animate-pulse": isCommandExecuting,
										"bg-[var(--vscode-editorWarning-foreground)]": isCommandPending,
									})}
								/>
								<span
									className={cn("text-[var(--vscode-descriptionForeground)] font-medium text-base shrink-0", {
										"text-[var(--vscode-charts-green)]": isCommandExecuting,
										"text-[var(--vscode-editorWarning-foreground)]": isCommandPending,
									})}>
									{getCommandStatusText(isCommandExecuting, isCommandPending, isCommandCompleted)}
								</span>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								{showCancelButton && (
									<button
										onClick={(e) => {
											e.stopPropagation()
											onCancelCommand?.()
										}}
										className="px-3 py-1 text-sm rounded border border-[var(--vscode-editorGroup-border)] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer"
										type="button">
										{isBackgroundExec ? "cancel" : "stop"}
									</button>
								)}
							</div>
						</div>
					)}

					<div className="bg-[var(--vscode-textCodeBlock-background)] opacity-60 text-sm">
						<CodeBlock forceWrap={true} source={`${"```"}shell\n${command}\n${"```"}`} />
					</div>

					{output.length > 0 && (
						<CommandOutputContent
							isContainerExpanded={true}
							isOutputFullyExpanded={isOutputFullyExpanded}
							onToggle={() => setIsOutputFullyExpanded(!isOutputFullyExpanded)}
							output={output}
						/>
					)}
				</div>
				{requestsApproval && (
					<div className="flex items-center gap-2.5 p-2 text-[12px] text-[var(--vscode-editorWarning-foreground)]">
						<i className="codicon codicon-warning" />
						<span>The model has determined this command requires explicit approval.</span>
					</div>
				)}
			</>
		)
	},
)

CommandOutputRow.displayName = "CommandOutputRow"

const CommandStatusMap = {
	executing: "Running",
	pending: "Pending",
	completed: "Completed",
	skipped: "Skipped",
}

function getCommandStatusText(isExecuting: boolean, isPending: boolean, isCompleted: boolean): string {
	if (isExecuting) {
		return CommandStatusMap.executing
	}
	if (isPending) {
		return CommandStatusMap.pending
	}
	if (isCompleted) {
		return CommandStatusMap.completed
	}
	return CommandStatusMap.skipped
}
