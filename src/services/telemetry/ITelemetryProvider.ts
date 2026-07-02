import type { AeriocodeAccountUserInfo } from "../auth/AuthService"

export interface ITelemetryProvider {
	readonly distinctId: string
	readonly telemetry: any
	readonly error: any
	readonly featureFlags: any

	log(event: string, properties?: Record<string, unknown>): void
	identifyAccount(userInfo?: AeriocodeAccountUserInfo, properties?: Record<string, unknown>): void
	toggleOptIn(optIn: boolean): void
	getFeatureFlag(flag: string): Promise<string | boolean | undefined>
	getFeatureFlagPayload(flag: string): Promise<any>
}
