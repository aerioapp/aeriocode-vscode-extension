export {
	type FeatureFlagsProviderConfig,
	FeatureFlagsProviderFactory,
	type FeatureFlagsProviderType,
} from "./FeatureFlagsProviderFactory"
export { FeatureFlagsService } from "./FeatureFlagsService"
export type { FeatureFlagsSettings, IFeatureFlagsProvider } from "./providers/IFeatureFlagsProvider"
export { NoOpFeatureFlagsProvider } from "./FeatureFlagsProviderFactory"

import { FeatureFlagsProviderFactory } from "./FeatureFlagsProviderFactory"
import { FeatureFlagsService } from "./FeatureFlagsService"

let _featureFlagsServiceInstance: FeatureFlagsService | null = null

/**
 * Get the singleton feature flags service instance
 */
export function getFeatureFlagsService(): FeatureFlagsService {
	if (!_featureFlagsServiceInstance) {
		const provider = FeatureFlagsProviderFactory.createProvider(FeatureFlagsProviderFactory.getDefaultConfig())
		_featureFlagsServiceInstance = new FeatureFlagsService(provider)
	}
	return _featureFlagsServiceInstance
}

/**
 * Reset the feature flags service instance (useful for testing)
 */
export function resetFeatureFlagsService(): void {
	_featureFlagsServiceInstance = null
}

export const featureFlagsService = new Proxy({} as FeatureFlagsService, {
	get(_target, prop, _receiver) {
		const service = getFeatureFlagsService()
		const value = Reflect.get(service, prop, service)
		if (typeof value === "function") {
			return value.bind(service)
		}
		return value
	},
})
