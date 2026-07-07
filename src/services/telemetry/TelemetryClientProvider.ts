import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"
import { telemetryManager } from "./TelemetryManager"
import { AuthService, type AeriocodeAccountUserInfo } from "../auth/AuthService"
import { ErrorService } from "../error/ErrorService"
import { FeatureFlagsService } from "../posthog/feature-flags/FeatureFlagsService"
import { TelemetryService } from "../posthog/telemetry/TelemetryService"
import { TelemetrySetting } from "@/shared/TelemetrySetting"
import type { ITelemetryProvider } from "./ITelemetryProvider"

const ENV_ID = vscode?.env?.machineId ?? process?.env?.UUID ?? uuidv4()

interface TelemetrySettings {
	aeriocode: boolean
	host: boolean
	level?: "all" | "off" | "error" | "crash"
}

export class TelemetryClientProvider implements ITelemetryProvider {
	private static _instance: TelemetryClientProvider | null = null

	public static getInstance(id?: string): TelemetryClientProvider {
		if (!TelemetryClientProvider._instance) {
			TelemetryClientProvider._instance = new TelemetryClientProvider(id)
		}
		return TelemetryClientProvider._instance
	}

	protected telemetrySettings: TelemetrySettings = {
		aeriocode: true,
		host: true,
		level: "all",
	}

	public readonly featureFlags: FeatureFlagsService
	public readonly telemetry: TelemetryService
	public readonly error: ErrorService

	private constructor(public distinctId = ENV_ID) {
		// Initialize telemetry manager with current settings
		this.initializeTelemetry()

		vscode.env.onDidChangeTelemetryEnabled((isTelemetryEnabled) => {
			this.telemetrySettings.host = isTelemetryEnabled
			this.updateTelemetryState()
		})

		if (vscode?.env?.isTelemetryEnabled === false) {
			this.telemetrySettings.host = false
		}

		const config = vscode.workspace.getConfiguration("aeriocode")
		if (config.get("telemetrySetting") === "disabled") {
			this.telemetrySettings.aeriocode = false
		}

		this.telemetrySettings.level = this.telemetryLevel

		// Initialize services
		this.telemetry = new TelemetryService(this)
		this.error = new ErrorService(this, this.distinctId)
		this.featureFlags = new FeatureFlagsService(
			(flag: string) => this.getFeatureFlag(flag),
			(flag: string) => this.getFeatureFlagPayload(flag),
		)
	}

	private async initializeTelemetry(): Promise<void> {
		const config = vscode.workspace.getConfiguration("aeriocode")
		const telemetrySetting = config.get<TelemetrySetting>("telemetrySetting") || "unset"

		await telemetryManager.initialize(telemetrySetting)
		telemetryManager.setUserId(this.distinctId)
	}

	private updateTelemetryState(): void {
		const isEnabled = this.isTelemetryEnabled
		// The telemetry manager will handle the actual enable/disable logic
		// based on VSCode's global telemetry setting
	}

	private get isTelemetryEnabled(): boolean {
		return this.telemetrySettings.aeriocode && this.telemetrySettings.host
	}

	/** Whether telemetry is currently enabled based on user and VSCode settings */
	private get telemetryLevel(): TelemetrySettings["level"] {
		if (!vscode?.env?.isTelemetryEnabled) {
			return "off"
		}
		const config = vscode.workspace.getConfiguration("telemetry")
		return config?.get<TelemetrySettings["level"]>("telemetryLevel") || "all"
	}

	public toggleOptIn(optIn: boolean): void {
		this.telemetrySettings.aeriocode = optIn
		// Update telemetry manager
		const setting: TelemetrySetting = optIn ? "enabled" : "disabled"
		telemetryManager.updateTelemetrySetting(setting)
	}

	/**
	 * Identifies the accounts user
	 * If userInfo is provided, it will use that to identify the user.
	 * Otherwise, it will use the DISTINCT_ID as the distinct ID.
	 * @param userInfo The user's information
	 */
	public async identifyAccount(userInfo?: AeriocodeAccountUserInfo, properties: Record<string, unknown> = {}): Promise<void> {
		if (!this.isTelemetryEnabled) {
			return
		}

		if (userInfo && userInfo?.id !== this.distinctId) {
			// Update user ID in telemetry manager
			telemetryManager.setUserId(userInfo.id)

			// Set auth token for telemetry requests
			try {
				const authToken = await AuthService.getInstance().getAuthToken()
				telemetryManager.setAuthToken(authToken)
			} catch (error) {
				console.error("Failed to get auth token for telemetry:", error)
			}

			// Log identification event
			this.log("user_identified", {
				uuid: userInfo.id,
				email: userInfo.email,
				name: userInfo.displayName,
				...properties,
				alias: this.distinctId,
			})

			this.distinctId = userInfo.id
		}
	}

	public log(event: string, properties?: Record<string, unknown>): void {
		if (!this.isTelemetryEnabled || this.telemetryLevel === "off") {
			return
		}

		// Filter events based on telemetry level
		if (this.telemetryLevel === "error") {
			if (!event.includes("error")) {
				return
			}
		}

		// Map PostHog events to our internal telemetry events
		this.mapAndCaptureEvent(event, properties)
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
				telemetryManager.captureBrowserToolStart(taskId || "", properties?.browserSettings as any)
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
				telemetryManager.captureOptionSelected(taskId || "", properties?.qty as number, properties?.mode as string)
				break
			case "task_options_ignored":
				telemetryManager.captureOptionsIgnored(taskId || "", properties?.qty as number, properties?.mode as string)
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
			case "extension_error":
				// Map to internal error tracking
				telemetryManager.captureProviderApiError({
					taskId: taskId || "",
					ulid: ulid || "",
					model: model || "",
					errorMessage: properties?.error_type as string,
					errorStatus: 500,
				})
				break
			case "extension_message":
				// Map to button click or generic event
				telemetryManager.captureButtonClick("extension_message", taskId)
				break
			case "user_identified":
				// This is handled in the identifyAccount method
				break
			default:
				// For any other events, capture as generic events
				telemetryManager.captureButtonClick(event, taskId)
				break
		}
	}

	/**
	 * Feature flag methods (mock implementation for compatibility)
	 */
	public async getFeatureFlag(flag: string): Promise<string | boolean | undefined> {
		// For now, return undefined to indicate feature flags are not available
		// This can be extended later to implement actual feature flagging
		return undefined
	}

	public async getFeatureFlagPayload(flag: string): Promise<any> {
		// For now, return undefined to indicate feature flag payloads are not available
		// This can be extended later to implement actual feature flagging
		return undefined
	}

	public dispose(): void {
		telemetryManager.dispose()
	}
}

const getFeatureFlagsService = (): FeatureFlagsService => TelemetryClientProvider.getInstance().featureFlags
const getErrorService = (): ErrorService => TelemetryClientProvider.getInstance().error
const getTelemetryService = (): TelemetryService => TelemetryClientProvider.getInstance().telemetry

// Service accessors
export const featureFlagsService = getFeatureFlagsService()
export const errorService = getErrorService()
export const telemetryService = getTelemetryService()
