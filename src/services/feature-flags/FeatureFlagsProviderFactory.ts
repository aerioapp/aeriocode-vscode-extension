import { aeriocodeEnvConfig } from "@/config"
import { Logger } from "@services/logging/Logger"
import type { FeatureFlagsAndPayloads, IFeatureFlagsProvider } from "./providers/IFeatureFlagsProvider"

/**
 * Supported feature flags provider types
 */
export type FeatureFlagsProviderType = "posthog" | "no-op"

/**
 * Configuration for feature flags providers
 */
export interface FeatureFlagsProviderConfig {
	type: FeatureFlagsProviderType
}

/**
 * Factory class for creating feature flags providers
 * Allows easy switching between different feature flag providers
 */
export class FeatureFlagsProviderFactory {
	/**
	 * Creates a feature flags provider based on the provided configuration
	 */
	public static createProvider(config: FeatureFlagsProviderConfig): IFeatureFlagsProvider {
		switch (config.type) {
			case "posthog": {
				// PostHog provider - create if client is available
				try {
					const { PostHogClientProvider } = require("../telemetry/providers/posthog/PostHogClientProvider")
					const sharedClient = PostHogClientProvider.getClient?.()
					if (sharedClient) {
						const { PostHogFeatureFlagsProvider } = require("./providers/PostHogFeatureFlagsProvider")
						return new PostHogFeatureFlagsProvider(sharedClient)
					}
				} catch {
					// PostHog not available, fall through to NoOp
				}
				return new NoOpFeatureFlagsProvider()
			}
			default:
				return new NoOpFeatureFlagsProvider()
		}
	}

	/**
	 * Gets the default feature flags provider configuration
	 */
	public static getDefaultConfig(): FeatureFlagsProviderConfig {
		return { type: "no-op" }
	}
}

/**
 * No-operation feature flags provider for when feature flags are disabled
 * or for testing purposes
 */
export class NoOpFeatureFlagsProvider implements IFeatureFlagsProvider {
	async getAllFlagsAndPayloads(_: { flagKeys?: string[] }): Promise<FeatureFlagsAndPayloads | undefined> {
		return {}
	}

	public isEnabled(): boolean {
		return true
	}

	public getSettings() {
		return {
			enabled: true,
			timeout: 1000,
		}
	}

	public async dispose(): Promise<void> {
		Logger.info("[NoOpFeatureFlagsProvider] Disposing")
	}
}
