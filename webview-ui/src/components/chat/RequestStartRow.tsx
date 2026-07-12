import type { AeriocodeMessage, AeriocodeSayTool } from "@shared/ExtensionMessage"
import type { LucideIcon } from "lucide-react"
import type React from "react"
import { useMemo } from "react"
import { FileIcon, FolderOpenDotIcon, FolderOpenIcon, SearchIcon, ShapesIcon, WrenchIcon } from "lucide-react"
import { cleanPathPrefix } from "../common/CodeAccordian"
import ErrorRow from "./ErrorRow"
import { ThinkingRow } from "./ThinkingRow"
import { TypewriterText } from "./TypewriterText"

const LOW_STAKES_TOOLS = new Set([
	"readFile",
	"listFilesTopLevel",
	"listFilesRecursive",
	"listCodeDefinitionNames",
	"searchFiles",
])

function isLowStakesTool(message: AeriocodeMessage): boolean {
	if (message.say !== "tool" && message.ask !== "tool") {
		return false
	}
	try {
		const tool = JSON.parse(message.text || "{}") as AeriocodeSayTool
		return LOW_STAKES_TOOLS.has(tool.tool)
	} catch {
		return false
	}
}

function getIconByToolName(toolName: string): LucideIcon {
	switch (toolName) {
		case "readFile":
			return FileIcon
		case "listFilesTopLevel":
			return FolderOpenIcon
		case "listFilesRecursive":
			return FolderOpenDotIcon
		case "searchFiles":
			return SearchIcon
		case "listCodeDefinitionNames":
			return ShapesIcon
		default:
			return WrenchIcon
	}
}

function isApiReqAbsorbable(apiReqTs: number, allMessages: AeriocodeMessage[]): boolean {
	const apiReqIdx = allMessages.findIndex((m) => m.ts === apiReqTs && m.say === "api_req_started")
	if (apiReqIdx === -1) return false

	let hasNonLowStakesTool = false
	for (let i = apiReqIdx + 1; i < allMessages.length; i++) {
		const msg = allMessages[i]
		if (msg.say === "api_req_started" || msg.say === "api_req_finished") break
		if (msg.ask === "tool" || msg.say === "tool") {
			if (!isLowStakesTool(msg)) {
				hasNonLowStakesTool = true
				break
			}
		}
	}
	return !hasNonLowStakesTool
}

interface RequestStartRowProps {
	message: AeriocodeMessage
	apiRequestFailedMessage?: string
	apiReqStreamingFailedMessage?: string
	cost?: number
	reasoningContent?: string
	responseStarted?: boolean
	aeriocodeMessages: AeriocodeMessage[]
	classNames?: string
	isExpanded: boolean
	handleToggle: () => void
}

type ApiReqState = "pre" | "thinking" | "error" | "final"

const formatSearchRegex = (regex: string, path: string, filePattern?: string): string => {
	const cleanedPath = cleanPathPrefix(path)
	const terms = regex
		.split("|")
		.map((t) => t.trim().replace(/\\b/g, "").replace(/\\s\?/g, " "))
		.filter(Boolean)
		.join(" | ")
	return filePattern && filePattern !== "*" ? `"${terms}" in ${cleanedPath}/ (${filePattern})` : `"${terms}" in ${cleanedPath}/`
}

const getActivityText = (tool: AeriocodeSayTool): string | null => {
	const cleanedPath = cleanPathPrefix(tool.path || "")
	switch (tool.tool) {
		case "readFile":
			return tool.path ? `Reading ${cleanedPath}...` : null
		case "listFilesTopLevel":
		case "listFilesRecursive":
			return tool.path ? `Exploring ${cleanedPath}/...` : null
		case "searchFiles":
			return tool.regex && tool.path ? `Searching ${formatSearchRegex(tool.regex, tool.path, tool.filePattern)}...` : null
		case "listCodeDefinitionNames":
			return tool.path ? `Analyzing ${cleanedPath}/...` : null
		default:
			return null
	}
}

const collectToolsInRange = (
	messages: AeriocodeMessage[],
	startIdx: number,
	endIdx: number,
): { icon: LucideIcon; text: string }[] => {
	const activities: { icon: LucideIcon; text: string }[] = []

	for (let i = startIdx; i < endIdx; i++) {
		const msg = messages[i]

		if (msg.say === "tool" || msg.ask !== "tool") {
			continue
		}

		try {
			const tool = JSON.parse(msg.text || "{}") as AeriocodeSayTool
			const activityText = getActivityText(tool)
			if (activityText) {
				const toolIcon = getIconByToolName(tool.tool)
				activities.push({ icon: toolIcon, text: activityText })
			}
		} catch {
			// ignore parse errors
		}
	}
	return activities
}

const findCurrentApiReq = (messages: AeriocodeMessage[]): { index: number; hasCost: boolean } | null => {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i]
		if (msg.say === "api_req_started" && msg.text) {
			try {
				const info = JSON.parse(msg.text)
				return { index: i, hasCost: info.cost != null }
			} catch {
				return null
			}
		}
	}
	return null
}

export const RequestStartRow: React.FC<RequestStartRowProps> = ({
	apiRequestFailedMessage,
	apiReqStreamingFailedMessage,
	cost,
	reasoningContent,
	responseStarted,
	aeriocodeMessages,
	handleToggle,
	isExpanded,
	message,
}) => {
	const hasError = !!(apiRequestFailedMessage || apiReqStreamingFailedMessage)
	const hasCost = cost != null
	const hasReasoning = !!reasoningContent

	const apiReqState: ApiReqState = hasError ? "error" : hasCost ? "final" : hasReasoning ? "thinking" : "pre"

	const willBeAbsorbed = useMemo(() => {
		return isApiReqAbsorbable(message.ts, aeriocodeMessages)
	}, [message.ts, aeriocodeMessages])

	const currentActivities = useMemo(() => {
		const currentApiReq = findCurrentApiReq(aeriocodeMessages)
		if (!currentApiReq) {
			return []
		}

		if (!currentApiReq.hasCost) {
			return collectToolsInRange(aeriocodeMessages, currentApiReq.index + 1, aeriocodeMessages.length)
		}
		return []
	}, [aeriocodeMessages])

	const hasCompletedTools = useMemo(() => {
		return aeriocodeMessages.some((msg, idx) => {
			if (msg.say === "tool" && isLowStakesTool(msg)) {
				for (let i = idx - 1; i >= 0; i--) {
					const prevMsg = aeriocodeMessages[i]
					if (prevMsg.say === "api_req_started" && prevMsg.text) {
						try {
							const info = JSON.parse(prevMsg.text)
							return info.cost != null
						} catch {
							return false
						}
					}
				}
			}
			return false
		})
	}, [aeriocodeMessages])

	const shouldShowActivities = currentActivities.length > 0 && !hasCompletedTools

	return (
		<div>
			{apiReqState === "pre" && shouldShowActivities && (
				<div className="flex items-center text-[var(--vscode-descriptionForeground)] w-full text-sm">
					<div className="ml-1 flex-1 w-full h-full">
						<div className="flex flex-col gap-0.5 w-full min-h-1">
							{currentActivities.map((activity, _) => (
								<div className="flex items-center gap-2 h-auto w-full overflow-hidden" key={activity.text}>
									<activity.icon className="size-2 text-[var(--vscode-foreground)] shrink-0" />
									<TypewriterText speed={15} text={activity.text} />
								</div>
							))}
						</div>
					</div>
				</div>
			)}
			{reasoningContent &&
				(!hasCost ? (
					<div className="ml-1 pl-0 mb-1 -mt-1.25 pt-1">
						<div className="inline-flex justify-baseline gap-0.5 text-left select-none px-0 w-full">
							<span className="animate-shimmer bg-linear-90 from-[var(--vscode-foreground)] to-[var(--vscode-descriptionForeground)] bg-[length:200%_100%] bg-clip-text text-transparent text-[13px] leading-none">
								Thinking...
							</span>
						</div>
					</div>
				) : (
					<ThinkingRow
						isExpanded={isExpanded}
						isVisible={true}
						onToggle={handleToggle}
						reasoningContent={reasoningContent}
						showTitle={true}
					/>
				))}

			{apiReqState === "error" && (
				<ErrorRow
					apiReqStreamingFailedMessage={apiReqStreamingFailedMessage}
					apiRequestFailedMessage={apiRequestFailedMessage}
					errorType="error"
					message={message}
				/>
			)}
		</div>
	)
}
