import { InternalTelemetryService } from "./InternalTelemetryService"
import { TelemetrySetting } from "@/shared/TelemetrySetting"
import * as vscode from "vscode"

/**
 * TelemetryManager provides a unified interface for telemetry operations
 * Replaces the PostHog-based telemetry with internal telemetry service
 */
export class TelemetryManager {
	private static instance: TelemetryManager
	private telemetryService: InternalTelemetryService
	private isInitialized: boolean = false

	private constructor() {
		this.telemetryService = new InternalTelemetryService()
	}

	/**
	 * Get the singleton instance of TelemetryManager
	 */
	public static getInstance(): TelemetryManager {
		if (!TelemetryManager.instance) {
			TelemetryManager.instance = new TelemetryManager()
		}
		return TelemetryManager.instance
	}

	/**
	 * Initialize telemetry with user settings
	 */
	public async initialize(telemetrySetting: TelemetrySetting): Promise<void> {
		if (this.isInitialized) {
			return
		}

		await this.telemetryService.updateTelemetryState(telemetrySetting)
		this.isInitialized = true
		console.info("[TelemetryManager] Initialized")
	}

	/**
	 * Update telemetry settings
	 */
	public async updateTelemetrySetting(telemetrySetting: TelemetrySetting): Promise<void> {
		await this.telemetryService.updateTelemetryState(telemetrySetting)
	}

	/**
	 * Set user ID for telemetry
	 */
	public setUserId(userId: string): void {
		this.telemetryService.setUserId(userId)
	}

	/**
	 * Start a new telemetry session
	 */
	public startNewSession(): void {
		this.telemetryService.startNewSession()
	}

	/**
	 * End current telemetry session
	 */
	public async endSession(): Promise<void> {
		await this.telemetryService.endSession()
	}

	// Event capture methods - these match the PostHog interface for easy replacement

	public captureExtensionActivated() {
		this.telemetryService.captureExtensionActivated()
	}

	public captureTaskCreated(taskId: string, ulid: string, apiProvider?: string) {
		this.telemetryService.captureTaskCreated(taskId, ulid, apiProvider)
	}

	public captureTaskRestarted(taskId: string, ulid: string, apiProvider?: string) {
		this.telemetryService.captureTaskRestarted(taskId, ulid, apiProvider)
	}

	public captureTaskCompleted(taskId: string, ulid: string) {
		this.telemetryService.captureTaskCompleted(taskId, ulid)
	}

	public captureTaskFeedback(taskId: string, feedbackType: string) {
		this.telemetryService.captureTaskFeedback(taskId, feedbackType)
	}

	public captureConversationTurnEvent(
		taskId: string,
		ulid: string,
		provider: string = "unknown",
		model: string = "unknown",
		source: "user" | "assistant",
		tokenUsage: {
			tokensIn?: number
			tokensOut?: number
			cacheWriteTokens?: number
			cacheReadTokens?: number
			totalCost?: number
		} = {},
	) {
		this.telemetryService.captureConversationTurnEvent(taskId, ulid, provider, model, source, tokenUsage)
	}

	public captureTokenUsage(taskId: string, tokensIn: number, tokensOut: number, model: string) {
		this.telemetryService.captureTokenUsage(taskId, tokensIn, tokensOut, model)
	}

	public captureModeSwitch(taskId: string, mode: string) {
		this.telemetryService.captureModeSwitch(taskId, mode)
	}

	public captureToolUsage(taskId: string, tool: string, modelId: string, autoApproved: boolean, success: boolean) {
		this.telemetryService.captureToolUsage(taskId, tool, modelId, autoApproved, success)
	}

	public captureCheckpointUsage(taskId: string, action: string, durationMs?: number) {
		this.telemetryService.captureCheckpointUsage(taskId, action, durationMs)
	}

	public captureDiffEditFailure(taskId: string, modelId: string, errorType?: string) {
		this.telemetryService.captureDiffEditFailure(taskId, modelId, errorType)
	}

	public captureBrowserToolStart(taskId: string, browserSettings: any) {
		this.telemetryService.captureBrowserToolStart(taskId, browserSettings)
	}

	public captureBrowserToolEnd(
		taskId: string,
		stats: {
			actionCount: number
			duration: number
			actions?: string[]
		},
	) {
		this.telemetryService.captureBrowserToolEnd(taskId, stats)
	}

	public captureBrowserError(taskId: string, errorType: string, errorMessage: string, context?: any) {
		this.telemetryService.captureBrowserError(taskId, errorType, errorMessage, context)
	}

	public captureOptionSelected(taskId: string, qty: number, mode: string) {
		this.telemetryService.captureOptionSelected(taskId, qty, mode)
	}

	public captureOptionsIgnored(taskId: string, qty: number, mode: string) {
		this.telemetryService.captureOptionsIgnored(taskId, qty, mode)
	}

	public captureGeminiApiPerformance(taskId: string, modelId: string, data: any) {
		this.telemetryService.captureGeminiApiPerformance(taskId, modelId, data)
	}

	public captureModelSelected(model: string, provider: string, taskId?: string) {
		this.telemetryService.captureModelSelected(model, provider, taskId)
	}

	public captureHistoricalTaskLoaded(taskId: string) {
		this.telemetryService.captureHistoricalTaskLoaded(taskId)
	}

	public captureRetryClicked(taskId: string) {
		this.telemetryService.captureRetryClicked(taskId)
	}

	public captureModelFavoritesUsage(model: string, isFavorited: boolean) {
		this.telemetryService.captureModelFavoritesUsage(model, isFavorited)
	}

	public captureButtonClick(button: string, taskId?: string) {
		this.telemetryService.captureButtonClick(button, taskId)
	}

	public captureProviderApiError(args: {
		taskId: string
		ulid: string
		model: string
		errorMessage: string
		errorStatus?: number
		requestId?: string
	}) {
		this.telemetryService.captureProviderApiError(args)
	}

	/**
	 * Check if telemetry is enabled
	 */
	public isTelemetryEnabled(): boolean {
		return this.telemetryService.isCategoryEnabled("checkpoints")
	}

	/**
	 * Dispose of resources
	 */
	public dispose(): void {
		this.telemetryService.dispose()
	}
}

// Export singleton instance for easy access
export const telemetryManager = TelemetryManager.getInstance()
