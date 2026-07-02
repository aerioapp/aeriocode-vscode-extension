import * as vscode from "vscode"
import { version as extensionVersion } from "../../../package.json"
import { telemetryManager } from "./TelemetryManager"
import { TelemetrySetting } from "@/shared/TelemetrySetting"
import { Mode } from "@/shared/storage/types"
import type { TaskFeedbackType } from "@shared/WebviewMessage"
import type { BrowserSettings } from "@shared/BrowserSettings"
import type { AeriocodeAccountUserInfo } from "@/services/auth/AuthService"

/**
 * CompatibilityTelemetryService provides a PostHog-compatible interface
 * that uses our internal telemetry system instead
 */

/**
 * Represents telemetry event categories that can be individually enabled or disabled
 */
type TelemetryCategory = "checkpoints" | "browser"

/**
 * Maximum length for error messages to prevent excessive data
 */
const MAX_ERROR_MESSAGE_LENGTH = 500

export class CompatibilityTelemetryService {
	/** Current version of the extension */
	private readonly version: string = extensionVersion
	/** Whether the extension is running in development mode */
	private readonly isDev = process.env.IS_DEV

	/**
	 * Constructor - simplified for compatibility
	 */
	public constructor() {
		console.info("[CompatibilityTelemetryService] Initialized with Internal Telemetry")
	}

	/**
	 * Updates the telemetry state based on user preferences and VSCode settings
	 * @param didUserOptIn Whether the user has explicitly opted into telemetry
	 */
	public async updateTelemetryState(didUserOptIn: boolean): Promise<void> {
		const setting: TelemetrySetting = didUserOptIn ? "enabled" : "disabled"
		await telemetryManager.updateTelemetrySetting(setting)
	}

	private addProperties(properties: any): any {
		return {
			...properties,
			extension_version: this.version,
			is_dev: this.isDev,
		}
	}

	/**
	 * Captures a telemetry event if telemetry is enabled
	 * @param event The event to capture with its properties
	 */
	public capture(event: { event: string; properties?: unknown }): void {
		const propertiesWithVersion = this.addProperties(event.properties)

		// Map PostHog events to internal telemetry events
		this.mapAndCaptureEvent(event.event, propertiesWithVersion)
	}

	public captureExtensionActivated() {
		telemetryManager.captureExtensionActivated()
	}

	/**
	 * Identifies the accounts user
	 * @param userInfo The user's information
	 */
	public identifyAccount(userInfo: AeriocodeAccountUserInfo) {
		telemetryManager.setUserId(userInfo.id)
		this.capture({
			event: "user_identified",
			properties: {
				uuid: userInfo.id,
				email: userInfo.email,
				name: userInfo.displayName,
			},
		})
	}

	// Task events
	public captureTaskCreated(taskId: string, ulid: string, apiProvider?: string) {
		telemetryManager.captureTaskCreated(taskId, ulid, apiProvider)
	}

	public captureTaskRestarted(taskId: string, ulid: string, apiProvider?: string) {
		telemetryManager.captureTaskRestarted(taskId, ulid, apiProvider)
	}

	public captureTaskCompleted(taskId: string, ulid: string) {
		telemetryManager.captureTaskCompleted(taskId, ulid)
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
		telemetryManager.captureConversationTurnEvent(taskId, ulid, provider, model, source, tokenUsage)
	}

	public captureTokenUsage(taskId: string, tokensIn: number, tokensOut: number, model: string) {
		telemetryManager.captureTokenUsage(taskId, tokensIn, tokensOut, model)
	}

	public captureModeSwitch(taskId: string, mode: Mode) {
		telemetryManager.captureModeSwitch(taskId, mode)
	}

	public captureTaskFeedback(taskId: string, feedbackType: TaskFeedbackType) {
		telemetryManager.captureTaskFeedback(taskId, feedbackType)
	}

	// Tool events
	public captureToolUsage(taskId: string, tool: string, modelId: string, autoApproved: boolean, success: boolean) {
		telemetryManager.captureToolUsage(taskId, tool, modelId, autoApproved, success)
	}

	public captureCheckpointUsage(
		taskId: string,
		action: "shadow_git_initialized" | "commit_created" | "restored" | "diff_generated",
		durationMs?: number,
	) {
		if (!this.isCategoryEnabled("checkpoints")) {
			return
		}
		telemetryManager.captureCheckpointUsage(taskId, action, durationMs)
	}

	public captureDiffEditFailure(taskId: string, modelId: string, errorType?: string) {
		telemetryManager.captureDiffEditFailure(taskId, modelId, errorType)
	}

	public captureModelSelected(model: string, provider: string, taskId?: string) {
		telemetryManager.captureModelSelected(model, provider, taskId)
	}

	public captureHistoricalTaskLoaded(taskId: string) {
		telemetryManager.captureHistoricalTaskLoaded(taskId)
	}

	public captureRetryClicked(taskId: string) {
		telemetryManager.captureRetryClicked(taskId)
	}

	public captureBrowserToolStart(taskId: string, browserSettings: BrowserSettings) {
		if (!this.isCategoryEnabled("browser")) {
			return
		}
		telemetryManager.captureBrowserToolStart(taskId, browserSettings)
	}

	public captureBrowserToolEnd(
		taskId: string,
		stats: {
			actionCount: number
			duration: number
			actions?: string[]
		},
	) {
		if (!this.isCategoryEnabled("browser")) {
			return
		}
		telemetryManager.captureBrowserToolEnd(taskId, stats)
	}

	public captureBrowserError(
		taskId: string,
		errorType: string,
		errorMessage: string,
		context?: {
			action?: string
			url?: string
			isRemote?: boolean
			[key: string]: unknown
		},
	) {
		if (!this.isCategoryEnabled("browser")) {
			return
		}
		telemetryManager.captureBrowserError(taskId, errorType, errorMessage, context)
	}

	public captureOptionSelected(taskId: string, qty: number, mode: Mode) {
		telemetryManager.captureOptionSelected(taskId, qty, mode)
	}

	public captureOptionsIgnored(taskId: string, qty: number, mode: Mode) {
		telemetryManager.captureOptionsIgnored(taskId, qty, mode)
	}

	public captureGeminiApiPerformance(
		taskId: string,
		modelId: string,
		data: {
			ttftSec?: number
			totalDurationSec?: number
			promptTokens: number
			outputTokens: number
			cacheReadTokens: number
			cacheHit: boolean
			cacheHitPercentage?: number
			apiSuccess: boolean
			apiError?: string
			throughputTokensPerSec?: number
		},
	) {
		telemetryManager.captureGeminiApiPerformance(taskId, modelId, data)
	}

	public captureModelFavoritesUsage(model: string, isFavorited: boolean) {
		telemetryManager.captureModelFavoritesUsage(model, isFavorited)
	}

	public captureButtonClick(button: string, taskId?: string) {
		telemetryManager.captureButtonClick(button, taskId)
	}

	public captureProviderApiError(args: {
		taskId: string
		ulid: string
		model: string
		errorMessage: string
		errorStatus?: number | undefined
		requestId?: string | undefined
	}) {
		telemetryManager.captureProviderApiError({
			...args,
			errorMessage: args.errorMessage.substring(0, MAX_ERROR_MESSAGE_LENGTH),
		})
	}

	/**
	 * Checks if a specific telemetry category is enabled
	 */
	public isCategoryEnabled(category: TelemetryCategory): boolean {
		// Default to true if category has not been explicitly configured
		return telemetryManager.isTelemetryEnabled()
	}

	/**
	 * Map PostHog events to internal telemetry events
	 */
	private mapAndCaptureEvent(event: string, properties?: Record<string, unknown>): void {
		// Extract common properties
		const taskId = properties?.taskId as string
		const ulid = properties?.ulid as string
		const model = properties?.model as string
		const provider = properties?.provider as string

		switch (event) {
			case "extension_activated":
				telemetryManager.captureExtensionActivated()
				break
			case "task_created":
				telemetryManager.captureTaskCreated(taskId || "", ulid || "", provider)
				break
			case "task_restarted":
				telemetryManager.captureTaskRestarted(taskId || "", ulid || "", provider)
				break
			case "task_completed":
				telemetryManager.captureTaskCompleted(taskId || "", ulid || "")
				break
			case "task_feedback":
				telemetryManager.captureTaskFeedback(taskId || "", properties?.feedbackType as string)
				break
			case "task_conversation_turn":
				telemetryManager.captureConversationTurnEvent(
					taskId || "",
					ulid || "",
					provider,
					model,
					(properties?.source as "user" | "assistant") || "user",
					{
						tokensIn: properties?.tokensIn as number,
						tokensOut: properties?.tokensOut as number,
						cacheWriteTokens: properties?.cacheWriteTokens as number,
						cacheReadTokens: properties?.cacheReadTokens as number,
						totalCost: properties?.totalCost as number,
					},
				)
				break
			case "task_token_usage":
				telemetryManager.captureTokenUsage(
					taskId || "",
					properties?.tokensIn as number,
					properties?.tokensOut as number,
					model || "",
				)
				break
			case "task_mode_switch":
				telemetryManager.captureModeSwitch(taskId || "", properties?.mode as string)
				break
			case "task_tool_used":
				telemetryManager.captureToolUsage(
					taskId || "",
					properties?.tool as string,
					model || "",
					properties?.autoApproved as boolean,
					properties?.success as boolean,
				)
				break
			case "task_checkpoint_used":
				telemetryManager.captureCheckpointUsage(
					taskId || "",
					properties?.action as string,
					properties?.durationMs as number,
				)
				break
			case "task_diff_edit_failed":
				telemetryManager.captureDiffEditFailure(taskId || "", model || "", properties?.errorType as string)
				break
			case "task_browser_tool_start":
				telemetryManager.captureBrowserToolStart(taskId || "", properties?.browserSettings as BrowserSettings)
				break
			case "task_browser_tool_end":
				telemetryManager.captureBrowserToolEnd(taskId || "", {
					actionCount: properties?.actionCount as number,
					duration: properties?.duration as number,
					actions: properties?.actions as string[],
				})
				break
			case "task_browser_error":
				telemetryManager.captureBrowserError(
					taskId || "",
					properties?.errorType as string,
					properties?.errorMessage as string,
					properties?.context,
				)
				break
			case "task_option_selected":
				telemetryManager.captureOptionSelected(taskId || "", properties?.qty as number, properties?.mode as Mode)
				break
			case "task_options_ignored":
				telemetryManager.captureOptionsIgnored(taskId || "", properties?.qty as number, properties?.mode as Mode)
				break
			case "task_gemini_api_performance":
				telemetryManager.captureGeminiApiPerformance(taskId || "", model || "", properties?.data as any)
				break
			case "ui_model_selected":
				telemetryManager.captureModelSelected(model || "", provider || "", taskId)
				break
			case "task_historical_loaded":
				telemetryManager.captureHistoricalTaskLoaded(taskId || "")
				break
			case "task_retry_clicked":
				telemetryManager.captureRetryClicked(taskId || "")
				break
			case "ui_model_favorite_toggled":
				telemetryManager.captureModelFavoritesUsage(model || "", properties?.isFavorited as boolean)
				break
			case "ui_button_clicked":
				telemetryManager.captureButtonClick(properties?.button as string, taskId)
				break
			case "task_provider_api_error":
				telemetryManager.captureProviderApiError({
					taskId: taskId || "",
					ulid: ulid || "",
					model: model || "",
					errorMessage: properties?.errorMessage as string,
					errorStatus: properties?.errorStatus as number,
					requestId: properties?.requestId as string,
				})
				break
			default:
				// For any other events, capture as generic events
				telemetryManager.captureButtonClick(event, taskId)
				break
		}
	}
}
