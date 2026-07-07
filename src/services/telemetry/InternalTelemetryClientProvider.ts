import { v4 as uuidv4 } from "uuid"
import * as vscode from "vscode"
import { CompatibilityTelemetryService } from "./CompatibilityTelemetryService"
import { ErrorService } from "../error/ErrorService"
import { FeatureFlagsService } from "../posthog/feature-flags/FeatureFlagsService"
import { telemetryManager } from "./TelemetryManager"
import { AuthService, type AeriocodeAccountUserInfo } from "../auth/AuthService"

const ENV_ID = vscode?.env?.machineId ?? process?.env?.UUID ?? uuidv4()

interface TelemetrySettings {
	aeriocode: boolean
	host: boolean
	level?: "all" | "off" | "error" | "crash"
}

/**
 * InternalTelemetryClientProvider provides a PostHog-compatible interface
 * that uses our internal telemetry system instead of PostHog
 */
export class InternalTelemetryClientProvider {
	private static _instance: InternalTelemetryClientProvider | null = null

	public static getInstance(id?: string): InternalTelemetryClientProvider {
		if (!InternalTelemetryClientProvider._instance) {
			InternalTelemetryClientProvider._instance = new InternalTelemetryClientProvider(id)
		}
		return InternalTelemetryClientProvider._instance
	}

	protected telemetrySettings: TelemetrySettings = {
		aeriocode: true,
		host: true,
		level: "all",
	}

	// Mock client property for compatibility
	public readonly client: any = {
		capture: (options: any) => {
			this.log(options.event, options.properties)
		},
		identify: (options: any) => {
			this.identifyAccount(
				{
					id: options.distinctId,
					email: options.properties?.email,
					displayName: options.properties?.name,
					username: options.properties?.username || options.distinctId,
					createdAt: new Date().toISOString(),
					organizations: [],
				},
				options.properties,
			)
		},
		optIn: () => {
			this.toggleOptIn(true)
		},
		optOut: () => {
			this.toggleOptIn(false)
		},
		shutdown: async () => {
			this.dispose()
		},
		getFeatureFlag: (flag: string) => {
			return this.getFeatureFlag(flag)
		},
		getFeatureFlagPayload: (flag: string) => {
			return this.getFeatureFlagPayload(flag)
		},
	}

	public readonly telemetry: CompatibilityTelemetryService
	public readonly error: ErrorService
	public readonly featureFlags: FeatureFlagsService

	public distinctId: string

	private constructor(distinctId = ENV_ID) {
		this.distinctId = distinctId

		// Initialize telemetry service
		this.telemetry = new CompatibilityTelemetryService()
		this.error = new ErrorService(this as any, this.distinctId)

		// Initialize feature flags service with mock methods
		this.featureFlags = new FeatureFlagsService(
			async (flag: string) => this.getFeatureFlag(flag),
			async (flag: string) => this.getFeatureFlagPayload(flag),
		)

		// Set up telemetry state monitoring
		vscode.env.onDidChangeTelemetryEnabled((isTelemetryEnabled) => {
			this.telemetrySettings.host = isTelemetryEnabled
		})

		if (vscode?.env?.isTelemetryEnabled === false) {
			this.telemetrySettings.host = false
		}

		const config = vscode.workspace.getConfiguration("aeriocode")
		if (config.get("telemetrySetting") === "disabled") {
			this.telemetrySettings.aeriocode = false
		}

		this.telemetrySettings.level = this.telemetryLevel
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
		// Update telemetry service
		this.telemetry.updateTelemetryState(optIn)
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
			// Set auth token for telemetry requests
			try {
				const authToken = await AuthService.getInstance().getAuthToken()
				telemetryManager.setAuthToken(authToken)
			} catch (error) {
				console.error("Failed to get auth token for telemetry:", error)
			}

			this.telemetry.identifyAccount(userInfo)
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

		// Use the telemetry service to capture the event
		this.telemetry.capture({ event, properties })
	}

	/**
	 * Feature flag methods (mock implementation for compatibility)
	 */
	private getFeatureFlag(flag: string): Promise<string | boolean | undefined> {
		// For now, return undefined to indicate feature flags are not available
		// This can be extended later to implement actual feature flagging
		return Promise.resolve(undefined)
	}

	private getFeatureFlagPayload(flag: string): Promise<any> {
		// For now, return undefined to indicate feature flag payloads are not available
		// This can be extended later to implement actual feature flagging
		return Promise.resolve(undefined)
	}

	public dispose(): void {
		// Clean up telemetry manager
		telemetryManager.dispose()
	}
}

// Export singleton instance for easy access
export const internalTelemetryClientProvider = InternalTelemetryClientProvider.getInstance()
