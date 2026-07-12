import type { TaskConfig } from "../types/TaskConfig"

export interface ModelInfo {
	providerId: string
	modelId: string
}

/**
 * Extracts provider and model info for telemetry from task config.
 */
export function getModelInfo(config: TaskConfig): ModelInfo {
	const apiConfig = config.services.stateManager.getApiConfiguration()
	const currentMode = config.services.stateManager.getGlobalSettingsKey("mode")
	const provider = (currentMode === "plan" ? apiConfig.planModeApiProvider : apiConfig.actModeApiProvider) as string
	const modelId = config.api.getModel().id

	return {
		providerId: provider,
		modelId,
	}
}

export interface CaptureAcceptedParams {
	ulid: string
	tool: string
	source: "agent" | "human"
	beforeContent: string
	afterContent: string
	providerId: string
	modelId: string
	filesCreated?: number
	filesDeleted?: number
	filesMoved?: number
}

export interface CaptureRejectedParams {
	ulid: string
	tool: string
	source: "agent" | "human"
	beforeContent: string
	afterContent: string
	providerId: string
	modelId: string
	filesCreated?: number
	filesDeleted?: number
	filesMoved?: number
}

/**
 * Captures accepted tool usage telemetry.
 */
export function captureAccepted(params: CaptureAcceptedParams): void {
	// Telemetry capture would go here
	// For now, this is a no-op placeholder
}

/**
 * Captures rejected tool usage telemetry.
 */
export function captureRejected(params: CaptureRejectedParams): void {
	// Telemetry capture would go here
	// For now, this is a no-op placeholder
}
