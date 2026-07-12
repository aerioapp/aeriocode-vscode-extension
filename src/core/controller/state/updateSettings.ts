import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { PlanActMode, UpdateSettingsRequest } from "@shared/proto/aeriocode/state"
import { buildApiHandler } from "../../../api"
import { convertStateApiConfigurationFromProto } from "@shared/proto-conversions/models/api-configuration-conversion"
import { TelemetrySetting } from "@/shared/TelemetrySetting"
import { OpenaiReasoningEffort } from "@/shared/storage/types"

/**
 * Updates multiple extension settings in a single request
 * @param controller The controller instance
 * @param request The request containing the settings to update
 * @returns An empty response
 */
export async function updateSettings(controller: Controller, request: UpdateSettingsRequest): Promise<Empty> {
	try {
		// Update API configuration
		if (request.apiConfiguration) {
			// Convert proto ApiConfiguration to application ApiConfiguration
			const apiConfiguration = convertStateApiConfigurationFromProto(request.apiConfiguration)
			controller.cacheService.setApiConfiguration(apiConfiguration)

			if (controller.task) {
				const currentMode = await controller.getCurrentMode()
				controller.task.api = buildApiHandler({ ...apiConfiguration, taskId: controller.task.taskId }, currentMode)
			}
		}

		// Update telemetry setting
		if (request.telemetrySetting) {
			await controller.updateTelemetrySetting(request.telemetrySetting as TelemetrySetting)
		}

		// Update plan/act separate models setting
		if (request.planActSeparateModelsSetting !== undefined) {
			await controller.context.globalState.update("planActSeparateModelsSetting", request.planActSeparateModelsSetting)
		}

		// Update checkpoints setting
		if (request.enableCheckpointsSetting !== undefined) {
			await controller.context.globalState.update("enableCheckpointsSetting", request.enableCheckpointsSetting)
		}

		// Update MCP marketplace setting
		if (request.mcpMarketplaceEnabled !== undefined) {
			await controller.context.globalState.update("mcpMarketplaceEnabled", request.mcpMarketplaceEnabled)
		}

		// Update MCP responses collapsed setting
		if (request.mcpResponsesCollapsed !== undefined) {
			await controller.context.globalState.update("mcpResponsesCollapsed", request.mcpResponsesCollapsed)
		}

		// Update MCP display mode setting
		if (request.mcpDisplayMode !== undefined) {
			await controller.context.globalState.update("mcpDisplayMode", request.mcpDisplayMode)
		}

		if (request.mode !== undefined) {
			const mode = request.mode === PlanActMode.PLAN ? "plan" : "act"
			if (controller.task) {
				controller.task.updateMode(mode)
			}
			await controller.context.globalState.update("mode", request.mode)
		}

		if (request.ocaReasoningEffort !== undefined) {
			if (controller.task) {
				controller.task.openaiReasoningEffort = request.ocaReasoningEffort as OpenaiReasoningEffort
			}
			await controller.context.globalState.update("openaiReasoningEffort", request.ocaReasoningEffort)
		}

		if (request.preferredLanguage !== undefined) {
			if (controller.task) {
				controller.task.preferredLanguage = request.preferredLanguage
			}
			await controller.context.globalState.update("preferredLanguage", request.preferredLanguage)
		}

		// Update terminal timeout setting
		if (request.shellIntegrationTimeout !== undefined) {
			await controller.context.globalState.update("shellIntegrationTimeout", Number(request.shellIntegrationTimeout))
		}

		// Update terminal reuse setting
		if (request.terminalReuseEnabled !== undefined) {
			await controller.context.globalState.update("terminalReuseEnabled", request.terminalReuseEnabled)
		}

		// Update terminal output line limit
		if (request.terminalOutputLineLimit !== undefined) {
			await controller.context.globalState.update("terminalOutputLineLimit", Number(request.terminalOutputLineLimit))
		}

		// Update strict plan mode setting
		if (request.strictPlanModeEnabled !== undefined) {
			if (controller.task) {
				controller.task.updateStrictPlanMode(request.strictPlanModeEnabled)
			}
			await controller.context.globalState.update("strictPlanModeEnabled", request.strictPlanModeEnabled)
		}

		// Post updated state to webview
		await controller.postStateToWebview()

		return Empty.create()
	} catch (error) {
		console.error("Failed to update settings:", error)
		throw error
	}
}
