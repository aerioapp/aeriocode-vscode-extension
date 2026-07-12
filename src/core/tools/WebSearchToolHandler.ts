import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { AeriocodeAsk, AeriocodeSayTool } from "@shared/ExtensionMessage"
import { telemetryService } from "@/services/telemetry"
import { parsePartialArrayString } from "@/shared/array"
import { showSystemNotification } from "@/integrations/notifications"
import type { ToolResponse } from "../task/index"
import type { IFullyManagedTool } from "./ToolExecutorCoordinator"
import type { TaskConfig } from "./types/TaskConfig"
import type { StronglyTypedUIHelpers } from "./types/UIHelpers"
import { ToolResultUtils } from "./utils/ToolResultUtils"

export class WebSearchToolHandler implements IFullyManagedTool {
	readonly name = "web_search"

	getDescription(block: ToolUse): string {
		return `[${block.name} for '${block.params.query}']`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const query = block.params.query || ""
		const sharedMessageProps: AeriocodeSayTool = {
			tool: "webFetch",
			path: uiHelpers.removeClosingTag(block, "query", query),
			content: `Searching for: ${uiHelpers.removeClosingTag(block, "query", query)}`,
			operationIsLocatedInWorkspace: false,
		}

		const partialMessage = JSON.stringify(sharedMessageProps)

		await uiHelpers.removeLastPartialMessageIfExistsWithType("say", "tool")
		await uiHelpers.ask("tool" as AeriocodeAsk, partialMessage, block.partial).catch(() => {})
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		try {
			const query: string | undefined = block.params.query
			const allowedDomainsRaw: string | undefined = block.params.allowed_domains
			const blockedDomainsRaw: string | undefined = block.params.blocked_domains

			const apiConfig = config.services.stateManager.getApiConfiguration()
			const currentMode = config.services.stateManager.getGlobalSettingsKey("mode")
			const provider = (currentMode === "plan" ? apiConfig.planModeApiProvider : apiConfig.actModeApiProvider) as string

			if (!query) {
				config.taskState.consecutiveMistakeCount++
				return await config.callbacks.sayAndCreateMissingParamError(this.name, "query")
			}
			config.taskState.consecutiveMistakeCount = 0

			const allowedDomains = parsePartialArrayString(allowedDomainsRaw || "[]")
			const blockedDomains = parsePartialArrayString(blockedDomainsRaw || "[]")

			if (allowedDomains.length > 0 && blockedDomains.length > 0) {
				config.taskState.consecutiveMistakeCount++
				return formatResponse.toolError("Cannot specify both allowed_domains and blocked_domains")
			}

			const sharedMessageProps: AeriocodeSayTool = {
				tool: "webFetch",
				path: query,
				content: `Searching for: ${query}`,
				operationIsLocatedInWorkspace: false,
			}
			const completeMessage = JSON.stringify(sharedMessageProps)

			if (config.callbacks.shouldAutoApproveTool(this.name)) {
				await config.callbacks.removeLastPartialMessageIfExistsWithType("ask", "tool")
				await config.callbacks.say("tool", completeMessage, undefined, undefined, false)
				telemetryService.captureToolUsage(config.ulid, "web_search", config.api.getModel().id, true, true)
			} else {
				const notificationMessage = `AerioCode wants to search for: ${query}`

				if (config.autoApprovalSettings.enableNotifications) {
					showSystemNotification({
						subtitle: "Approval Required",
						message: notificationMessage,
					})
				}

				await config.callbacks.removeLastPartialMessageIfExistsWithType("say", "tool")

				const didApprove = await ToolResultUtils.askApprovalAndPushFeedback("tool", completeMessage, config)
				if (!didApprove) {
					telemetryService.captureToolUsage(config.ulid, block.name, config.api.getModel().id, false, false)
					return formatResponse.toolDenied()
				} else {
					telemetryService.captureToolUsage(config.ulid, block.name, config.api.getModel().id, false, true)
				}
			}

			const resultText = `Web search for "${query}" completed. Note: Web search requires AerioCode account integration.`
			return formatResponse.toolResult(resultText)
		} catch (error) {
			return `Error performing web search: ${(error as Error).message}`
		}
	}
}
