/**
 * Payload type for feature flags - can be boolean or any JSON-serializable value
 */
export type FeatureFlagPayload = boolean | string | number | object | null | undefined

/**
 * Structure returned by feature flags providers
 */
export interface FeatureFlagsAndPayloads {
	featureFlags?: Record<string, boolean>
	featureFlagPayloads?: Record<string, FeatureFlagPayload>
}

/**
 * Settings for the feature flags provider
 */
export interface FeatureFlagsSettings {
	enabled: boolean
	timeout?: number
}

/**
 * Interface for feature flags providers
 * Each provider (PostHog, LaunchDarkly, etc.) implements this interface
 */
export interface IFeatureFlagsProvider {
	/**
	 * Get all feature flags and their payloads
	 */
	getAllFlagsAndPayloads(params: { flagKeys?: string[] }): Promise<FeatureFlagsAndPayloads | undefined>

	/**
	 * Check if the provider is enabled/available
	 */
	isEnabled(): boolean

	/**
	 * Get current settings
	 */
	getSettings(): FeatureFlagsSettings

	/**
	 * Clean up resources
	 */
	dispose(): Promise<void>
}
