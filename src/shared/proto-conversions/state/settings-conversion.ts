import { ApiConfiguration, ApiProvider } from "@shared/api"
import { ModelsApiConfiguration } from "@shared/proto/aeriocode/models"

/**
 * Converts domain ApiConfiguration objects to proto ApiConfiguration objects
 */
export function convertApiConfigurationToProtoApiConfiguration(config: ApiConfiguration): ModelsApiConfiguration {
	return ModelsApiConfiguration.create({
		// Aeriocode-specific fields only
		aeriocodeAccountId: config.aeriocodeAccountId,

		// Plan mode configurations - Aeriocode only
		planModeApiProvider: config.planModeApiProvider === "aeriocode" ? 16 : 16, // AERIOCODE = 16
		planModeApiModelId: config.planModeApiModelId,
		planModeThinkingBudgetTokens: config.planModeThinkingBudgetTokens
			? Number(config.planModeThinkingBudgetTokens)
			: undefined,
		planModeReasoningEffort: config.planModeReasoningEffort,

		// Act mode configurations - Aeriocode only
		actModeApiProvider: config.actModeApiProvider === "aeriocode" ? 16 : 16, // AERIOCODE = 16
		actModeApiModelId: config.actModeApiModelId,
		actModeThinkingBudgetTokens: config.actModeThinkingBudgetTokens ? Number(config.actModeThinkingBudgetTokens) : undefined,
		actModeReasoningEffort: config.actModeReasoningEffort,

		// Favorited model IDs
		favoritedModelIds: config.favoritedModelIds || [],
	})
}

/**
 * Converts proto ApiConfiguration objects to domain ApiConfiguration objects
 */
export function convertProtoApiConfigurationToApiConfiguration(protoConfig: ModelsApiConfiguration): ApiConfiguration {
	return {
		// Aeriocode-specific fields only
		aeriocodeAccountId: protoConfig.aeriocodeAccountId,

		// Plan mode configurations - Aeriocode only
		planModeApiProvider: "aeriocode",
		planModeApiModelId: protoConfig.planModeApiModelId,
		planModeThinkingBudgetTokens: protoConfig.planModeThinkingBudgetTokens
			? Number(protoConfig.planModeThinkingBudgetTokens)
			: undefined,
		planModeReasoningEffort: protoConfig.planModeReasoningEffort,

		// Act mode configurations - Aeriocode only
		actModeApiProvider: "aeriocode",
		actModeApiModelId: protoConfig.actModeApiModelId,
		actModeThinkingBudgetTokens: protoConfig.actModeThinkingBudgetTokens
			? Number(protoConfig.actModeThinkingBudgetTokens)
			: undefined,
		actModeReasoningEffort: protoConfig.actModeReasoningEffort,

		// Favorited model IDs
		favoritedModelIds: protoConfig.favoritedModelIds || [],
	}
}
