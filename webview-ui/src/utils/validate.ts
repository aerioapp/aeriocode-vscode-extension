import { ApiConfiguration, ModelInfo } from "@shared/api"
import { getModeSpecificFields } from "@/components/settings/utils/providerUtils"
import { Mode } from "@shared/storage/types"

export function validateApiConfiguration(currentMode: Mode, apiConfiguration?: ApiConfiguration): string | undefined {
	if (apiConfiguration) {
		const { apiProvider } = getModeSpecificFields(apiConfiguration, currentMode)

		switch (apiProvider) {
			case "aeriocode":
				if (!apiConfiguration.aeriocodeAccountId) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
		}
	}
	return undefined
}

export function validateModelId(
	currentMode: Mode,
	apiConfiguration?: ApiConfiguration,
	openRouterModels?: Record<string, ModelInfo>,
): string | undefined {
	if (apiConfiguration) {
		const { apiProvider } = getModeSpecificFields(apiConfiguration, currentMode)
		switch (apiProvider) {
			case "aeriocode":
				// Aeriocode uses default backend model, no validation needed
				return undefined
		}
	}
	return undefined
}
