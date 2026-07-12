import { FEATURE_FLAGS, FeatureFlag, FeatureFlagDefaultValue } from "@/shared/services/feature-flags/feature-flags"
import { Logger } from "@services/logging/Logger"
import type { FeatureFlagPayload, FeatureFlagsAndPayloads, IFeatureFlagsProvider } from "./providers/IFeatureFlagsProvider"

const DEFAULT_CACHE_TTL = 60 * 60 * 1000

type CacheInfo = {
	updateTime: number
	userId: string | null
	flagsPayload?: FeatureFlagsAndPayloads
}

/**
 * FeatureFlagsService provides feature flag functionality that works independently
 * of telemetry settings. Feature flags are always available to ensure proper
 * functionality of the extension regardless of user's telemetry preferences.
 * Uses an abstracted feature flags provider to support multiple backends
 */
export class FeatureFlagsService {
	public constructor(private provider: IFeatureFlagsProvider) {}

	private cache: Map<FeatureFlag, FeatureFlagPayload> = new Map()
	private cacheInfo: CacheInfo = { updateTime: 0, userId: null }

	/**
	 * Poll all known feature flags to update their cached values
	 */
	public async poll(userId: string | null): Promise<void> {
		const timesNow = Date.now()
		if (timesNow - this.cacheInfo.updateTime < DEFAULT_CACHE_TTL && this.cache.size) {
			if (this.cacheInfo.userId === userId) {
				return
			}
		}

		this.cacheInfo = { updateTime: timesNow, userId: userId || null }

		try {
			const flagKeys = Object.values(FEATURE_FLAGS) as string[]
			const values = await this.provider.getAllFlagsAndPayloads({
				flagKeys,
			})
			this.cacheInfo.flagsPayload = values

			for (const flag of Object.values(FEATURE_FLAGS) as FeatureFlag[]) {
				const payload = await this.getFeatureFlag(flag).catch(() => false)
				this.cache.set(flag, payload ?? false)
			}
		} catch (error) {
			this.cacheInfo = { updateTime: 0, userId: null }
			throw error
		}
	}

	private async getFeatureFlag(flagName: FeatureFlag): Promise<FeatureFlagPayload | undefined> {
		try {
			const payload = this.cacheInfo.flagsPayload?.featureFlagPayloads?.[flagName]
			const flagValue = this.cacheInfo.flagsPayload?.featureFlags?.[flagName]
			const value = payload ?? flagValue ?? FeatureFlagDefaultValue[flagName] ?? undefined

			return value
		} catch (error) {
			Logger.error(`Error checking if feature flag ${flagName} is enabled:`, error)
			return FeatureFlagDefaultValue[flagName] ?? false
		}
	}

	/**
	 * Wrapper: safely get boolean flag with default fallback
	 */
	public getBooleanFlagEnabled(flagName: FeatureFlag): boolean {
		return this.cache.get(flagName) === true
	}

	/**
	 * Get a cached flag payload (or default) without triggering a network call.
	 */
	public getFlagPayload(flagName: FeatureFlag): FeatureFlagPayload | undefined {
		return this.cache.get(flagName) ?? FeatureFlagDefaultValue[flagName]
	}

	/**
	 * Get the feature flags provider instance
	 */
	public getProvider(): IFeatureFlagsProvider {
		return this.provider
	}

	/**
	 * Check if feature flags are currently enabled
	 */
	public isEnabled(): boolean {
		return this.provider.isEnabled()
	}

	/**
	 * Get current feature flags settings
	 */
	public getSettings() {
		return this.provider.getSettings()
	}

	/**
	 * For testing: directly set a feature flag in the cache
	 */
	public test(flagName: FeatureFlag, value: boolean) {
		if (process.env.NODE_ENV === "true") {
			this.cache.set(flagName, value)
		}
	}

	/**
	 * Clean up resources when the service is disposed
	 */
	public async dispose(): Promise<void> {
		await this.provider.dispose()
	}
}
