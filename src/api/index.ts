import { ApiConfiguration, ModelInfo } from "../shared/api"
import { ApiStream, ApiStreamUsageChunk } from "./transform/stream"
import { AeriocodeHandler } from "./providers/aeriocode"
import { Mode } from "@shared/storage/types"

export interface ApiHandler {
	createMessage(systemPrompt: string, messages: any[]): ApiStream
	getModel(): { id: string; info: ModelInfo }
	getApiStreamUsage?(): Promise<ApiStreamUsageChunk | undefined>
}

export interface SingleCompletionHandler {
	completePrompt(prompt: string): Promise<string>
}

function createHandlerForProvider(
	apiProvider: string | undefined,
	options: Omit<ApiConfiguration, "apiProvider">,
	mode: Mode,
): ApiHandler {
	// Set the model ID based on the current mode
	const modelId = mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId

	// Only support Aeriocode provider
	return new AeriocodeHandler({
		aeriocodeAccountId: options.aeriocodeAccountId,
		taskId: options.taskId,
		modelId: modelId,
		reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
		thinkingBudgetTokens: mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
	})
}

export function buildApiHandler(configuration: ApiConfiguration, mode: Mode): ApiHandler {
	const { planModeApiProvider, actModeApiProvider, ...options } = configuration

	const apiProvider = mode === "plan" ? planModeApiProvider : actModeApiProvider

	// Validate thinking budget tokens against model's maxTokens to prevent API errors
	// wrapped in a try-catch for safety, but this should never throw
	try {
		const thinkingBudgetTokens = mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens
		if (thinkingBudgetTokens && thinkingBudgetTokens > 0) {
			const handler = createHandlerForProvider(apiProvider, options, mode)

			const modelInfo = handler.getModel().info
			if (modelInfo.maxTokens && thinkingBudgetTokens > modelInfo.maxTokens) {
				const clippedValue = modelInfo.maxTokens - 1
				if (mode === "plan") {
					options.planModeThinkingBudgetTokens = clippedValue
				} else {
					options.actModeThinkingBudgetTokens = clippedValue
				}
			} else {
				return handler // don't rebuild unless its necessary
			}
		}
	} catch (error) {
		console.error("buildApiHandler error:", error)
	}

	return createHandlerForProvider(apiProvider, options, mode)
}
