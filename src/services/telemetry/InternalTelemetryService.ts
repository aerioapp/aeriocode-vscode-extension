import * as vscode from "vscode"
import { version as extensionVersion } from "../../../package.json"
import { TelemetrySetting } from "@/shared/TelemetrySetting"
import { HostProvider } from "@/hosts/host-provider"
import { ShowMessageType } from "@/shared/proto/host/window"
import { aeriocodeEnvConfig } from "@/config"

/**
 * InternalTelemetryService handles telemetry event tracking for the Aeriocode extension
 * Uses the internal backend API instead of PostHog for data collection
 * Respects user privacy settings and VSCode's global telemetry configuration
 */

/**
 * Represents telemetry event categories that can be individually enabled or disabled
 */
type TelemetryCategory = "checkpoints" | "browser"

/**
 * Maximum length for error messages to prevent excessive data
 */
const MAX_ERROR_MESSAGE_LENGTH = 500

export class InternalTelemetryService {
	/** Current version of the extension */
	private readonly version: string = extensionVersion
	/** Whether the extension is running in development mode */
	private readonly isDev = process.env.IS_DEV === "true"
	/** Whether telemetry is currently enabled */
	private isEnabled: boolean = false
	/** Current telemetry setting */
	private telemetrySetting: TelemetrySetting = "unset"
	/** Session ID for grouping events */
	private sessionId: string = this.generateSessionId()
	/** User ID for tracking */
	private userId: string = "anonymous"
	/** Batch queue for events */
	private eventQueue: Array<any> = []
	/** Batch timer */
	private batchTimer: NodeJS.Timeout | null = null
	/** Batch size limit */
	private readonly BATCH_SIZE = 50
	/** Batch time limit (5 seconds) */
	private readonly BATCH_TIME = 5000
	/** Authentication token for backend requests */
	private authToken: string | null = null

	/**
	 * Constructor
	 */
	public constructor() {
		console.info("[InternalTelemetryService] Initialized")
		this.startBatchTimer()
	}

	/**
	 * Updates the telemetry state based on user preferences and VSCode settings
	 * Only enables telemetry if both VSCode global telemetry is enabled and user has opted in
	 * @param telemetrySetting The user's telemetry setting
	 */
	public async updateTelemetryState(telemetrySetting: TelemetrySetting): Promise<void> {
		this.telemetrySetting = telemetrySetting

		// Check VSCode global telemetry setting
		const vscodeTelemetryEnabled = vscode.env.isTelemetryEnabled

		// Only enable telemetry if both conditions are met
		this.isEnabled = vscodeTelemetryEnabled && telemetrySetting === "enabled"

		if (telemetrySetting === "enabled" && !vscodeTelemetryEnabled) {
			// Show warning if user wants telemetry but VSCode has it disabled
			void HostProvider.window
				.showMessage({
					type: ShowMessageType.WARNING,
					message:
						"Anonymous Aeriocode error and usage reporting is enabled, but VSCode telemetry is disabled. To enable error and usage reporting for this extension, enable VSCode telemetry in settings.",
					options: {
						items: ["Open Settings"],
					},
				})
				.then((response) => {
					if (response.selectedOption === "Open Settings") {
						void vscode.commands.executeCommand("workbench.action.openSettings", "telemetry.telemetryLevel")
					}
				})
		}

		console.info(`[InternalTelemetryService] Telemetry state updated: ${this.isEnabled ? "enabled" : "disabled"}`)
	}

	/**
	 * Set the user ID for telemetry
	 */
	public setUserId(userId: string): void {
		this.userId = userId || "anonymous"
	}

	/**
	 * Set the authentication token for backend requests
	 */
	public setAuthToken(token: string | null): void {
		this.authToken = token
	}

	/**
	 * Generate a unique session ID
	 */
	private generateSessionId(): string {
		return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}

	/**
	 * Start a new session
	 */
	public startNewSession(): void {
		this.sessionId = this.generateSessionId()
		console.info(`[InternalTelemetryService] Started new session: ${this.sessionId}`)
	}

	/**
	 * Add properties to event
	 */
	private addProperties(properties: any = {}): any {
		return {
			...properties,
			extension_version: this.version,
			is_dev: this.isDev,
			session_id: this.sessionId,
			timestamp: new Date().toISOString(),
		}
	}

	/**
	 * Record a telemetry event
	 */
	private recordEvent(eventName: string, properties: any = {}): void {
		if (!this.isEnabled) {
			return
		}

		const event = {
			eventName,
			properties: this.addProperties(properties),
			metadata: {
				extensionVersion: this.version,
				isDev: this.isDev,
			},
		}

		this.eventQueue.push(event)

		// Send immediately if queue is full
		if (this.eventQueue.length >= this.BATCH_SIZE) {
			this.flushEvents()
		}
	}

	/**
	 * Record multiple events in batch
	 */
	private recordEvents(events: Array<{ eventName: string; properties?: any }>): void {
		if (!this.isEnabled) {
			return
		}

		const processedEvents = events.map((event) => ({
			eventName: event.eventName,
			properties: this.addProperties(event.properties),
			metadata: {
				extensionVersion: this.version,
				isDev: this.isDev,
			},
		}))

		this.eventQueue.push(...processedEvents)

		// Send immediately if queue is full
		if (this.eventQueue.length >= this.BATCH_SIZE) {
			this.flushEvents()
		}
	}

	/**
	 * Start batch timer
	 */
	private startBatchTimer(): void {
		if (this.batchTimer) {
			clearInterval(this.batchTimer)
		}

		this.batchTimer = setInterval(() => {
			if (this.eventQueue.length > 0) {
				this.flushEvents()
			}
		}, this.BATCH_TIME)
	}

	/**
	 * Make HTTP request to telemetry API
	 */
	private async makeTelemetryRequest(endpoint: string, data: any): Promise<void> {
		try {
			const backendUrl = aeriocodeEnvConfig.apiBaseUrl

			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			}

			// Include authentication token if available
			if (this.authToken) {
				headers["Authorization"] = `Bearer ${this.authToken}`
			}

			const response = await fetch(`${backendUrl}${endpoint}`, {
				method: "POST",
				headers,
				body: JSON.stringify(data),
			})

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}
		} catch (error) {
			// Log error but don't throw - telemetry failures shouldn't break the extension
			console.error(`[InternalTelemetryService] Request to ${endpoint} failed:`, error)
			// Silently fail to avoid breaking the extension when telemetry is unavailable
		}
	}

	/**
	 * Flush events to server
	 */
	private async flushEvents(): Promise<void> {
		if (this.eventQueue.length === 0) {
			return
		}

		const eventsToSend = [...this.eventQueue]
		this.eventQueue = []

		try {
			await this.makeTelemetryRequest("/api/telemetry/record/events", {
				events: eventsToSend,
			})

			console.info(`[InternalTelemetryService] Sent ${eventsToSend.length} events to server`)
		} catch (error) {
			console.error("[InternalTelemetryService] Failed to send events:", error)
			// Put events back in queue for retry
			this.eventQueue.unshift(...eventsToSend)
		}
	}

	/**
	 * End current session
	 */
	public async endSession(): Promise<void> {
		if (!this.isEnabled) {
			return
		}

		try {
			await this.makeTelemetryRequest("/api/telemetry/record/session/end", {})
		} catch (error) {
			console.error("[InternalTelemetryService] Failed to end session:", error)
		}

		this.startNewSession()
	}

	// Event capture methods

	public captureExtensionActivated() {
		this.recordEvent("user.extension_activated")
	}

	public captureTaskCreated(taskId: string, ulid: string, apiProvider?: string) {
		this.recordEvent("task.created", { taskId, ulid, apiProvider })
	}

	public captureTaskRestarted(taskId: string, ulid: string, apiProvider?: string) {
		this.recordEvent("task.restarted", { taskId, ulid, apiProvider })
	}

	public captureTaskCompleted(taskId: string, ulid: string) {
		this.recordEvent("task.completed", { taskId, ulid })
	}

	public captureTaskFeedback(taskId: string, feedbackType: string) {
		console.info("InternalTelemetryService: Capturing task feedback", {
			taskId,
			feedbackType,
		})
		this.recordEvent("task.feedback", { taskId, feedbackType })
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
		if (!taskId || !ulid || !provider || !model || !source) {
			console.warn("InternalTelemetryService: Missing required parameters for message capture")
			return
		}

		this.recordEvent("task.conversation_turn", {
			taskId,
			ulid,
			provider,
			model,
			source,
			...tokenUsage,
		})
	}

	public captureTokenUsage(taskId: string, tokensIn: number, tokensOut: number, model: string) {
		this.recordEvent("task.token_usage", { taskId, tokensIn, tokensOut, model })
	}

	public captureModeSwitch(taskId: string, mode: string) {
		this.recordEvent("task.mode_switch", { taskId, mode })
	}

	public captureToolUsage(taskId: string, tool: string, modelId: string, autoApproved: boolean, success: boolean) {
		this.recordEvent("task.tool_used", { taskId, tool, modelId, autoApproved, success })
	}

	public captureCheckpointUsage(taskId: string, action: string, durationMs?: number) {
		if (!this.isCategoryEnabled("checkpoints")) {
			return
		}

		this.recordEvent("task.checkpoint_used", { taskId, action, durationMs })
	}

	public captureDiffEditFailure(taskId: string, modelId: string, errorType?: string) {
		this.recordEvent("task.diff_edit_failed", { taskId, errorType, modelId })
	}

	public captureBrowserToolStart(taskId: string, browserSettings: any) {
		if (!this.isCategoryEnabled("browser")) {
			return
		}

		this.recordEvent("task.browser_tool_start", {
			taskId,
			viewport: browserSettings.viewport,
			isRemote: !!browserSettings.remoteBrowserEnabled,
			remoteBrowserHost: browserSettings.remoteBrowserHost,
		})
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

		this.recordEvent("task.browser_tool_end", {
			taskId,
			actionCount: stats.actionCount,
			duration: stats.duration,
			actions: stats.actions,
		})
	}

	public captureBrowserError(taskId: string, errorType: string, errorMessage: string, context?: any) {
		if (!this.isCategoryEnabled("browser")) {
			return
		}

		this.recordEvent("task.browser_error", {
			taskId,
			errorType,
			errorMessage: errorMessage.substring(0, MAX_ERROR_MESSAGE_LENGTH),
			context,
		})
	}

	public captureOptionSelected(taskId: string, qty: number, mode: string) {
		this.recordEvent("task.option_selected", { taskId, qty, mode })
	}

	public captureOptionsIgnored(taskId: string, qty: number, mode: string) {
		this.recordEvent("task.options_ignored", { taskId, qty, mode })
	}

	public captureGeminiApiPerformance(taskId: string, modelId: string, data: any) {
		this.recordEvent("task.gemini_api_performance", {
			taskId,
			modelId,
			...data,
		})
	}

	public captureModelSelected(model: string, provider: string, taskId?: string) {
		this.recordEvent("ui.model_selected", { model, provider, taskId })
	}

	public captureHistoricalTaskLoaded(taskId: string) {
		this.recordEvent("task.historical_loaded", { taskId })
	}

	public captureRetryClicked(taskId: string) {
		this.recordEvent("task.retry_clicked", { taskId })
	}

	public captureModelFavoritesUsage(model: string, isFavorited: boolean) {
		this.recordEvent("ui.model_favorite_toggled", { model, isFavorited })
	}

	public captureButtonClick(button: string, taskId?: string) {
		this.recordEvent("ui.button_clicked", { button, taskId })
	}

	public captureProviderApiError(args: {
		taskId: string
		ulid: string
		model: string
		errorMessage: string
		errorStatus?: number
		requestId?: string
	}) {
		this.recordEvent("task.provider_api_error", {
			...args,
			errorMessage: args.errorMessage.substring(0, MAX_ERROR_MESSAGE_LENGTH),
		})
	}

	/**
	 * Checks if a specific telemetry category is enabled
	 */
	public isCategoryEnabled(category: TelemetryCategory): boolean {
		// For now, all categories are enabled when telemetry is enabled
		// This can be extended to have per-category controls
		return this.isEnabled
	}

	/**
	 * Dispose of resources
	 */
	public dispose(): void {
		if (this.batchTimer) {
			clearInterval(this.batchTimer)
			this.batchTimer = null
		}

		// Send any remaining events
		if (this.eventQueue.length > 0) {
			this.flushEvents()
		}
	}
}
