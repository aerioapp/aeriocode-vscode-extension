import { ApiConfiguration, ApiProvider } from "@shared/api"
import { ModelsApiConfiguration, ApiProvider as ProtoApiProvider } from "@shared/proto/aeriocode/models"
import { ApiConfiguration as StateApiConfiguration } from "@shared/proto/aeriocode/state"

/**
 * Converts API configuration to proto format (simplified for Aeriocode only)
 * @param config The API configuration
 * @returns Proto API configuration
 */
export function convertApiConfigurationToProto(config: ApiConfiguration): ModelsApiConfiguration {
	return ModelsApiConfiguration.create({
		// Only include Aeriocode-specific fields
		aeriocodeAccountId: config.aeriocodeAccountId,
		favoritedModelIds: config.favoritedModelIds || [],

		// Plan mode configurations (Aeriocode only)
		planModeApiProvider: ProtoApiProvider.AERIOCODE,
		planModeApiModelId: config.planModeApiModelId,
		planModeThinkingBudgetTokens: config.planModeThinkingBudgetTokens,
		planModeReasoningEffort: config.planModeReasoningEffort,

		// Act mode configurations (Aeriocode only)
		actModeApiProvider: ProtoApiProvider.AERIOCODE,
		actModeApiModelId: config.actModeApiModelId,
		actModeThinkingBudgetTokens: config.actModeThinkingBudgetTokens,
		actModeReasoningEffort: config.actModeReasoningEffort,
	})
}

/**
 * Converts proto API configuration to regular format (simplified for Aeriocode only)
 * @param protoConfig The proto API configuration
 * @returns API configuration
 */
export function convertApiConfigurationFromProto(protoConfig: ModelsApiConfiguration): ApiConfiguration {
	return {
		// Only include Aeriocode-specific fields
		aeriocodeAccountId: protoConfig.aeriocodeAccountId,
		favoritedModelIds: protoConfig.favoritedModelIds,

		// Plan mode configurations (Aeriocode only)
		planModeApiProvider: "aeriocode",
		planModeApiModelId: protoConfig.planModeApiModelId,
		planModeThinkingBudgetTokens: protoConfig.planModeThinkingBudgetTokens,
		planModeReasoningEffort: protoConfig.planModeReasoningEffort,

		// Act mode configurations (Aeriocode only)
		actModeApiProvider: "aeriocode",
		actModeApiModelId: protoConfig.actModeApiModelId,
		actModeThinkingBudgetTokens: protoConfig.actModeThinkingBudgetTokens,
		actModeReasoningEffort: protoConfig.actModeReasoningEffort,
	} as ApiConfiguration
}

/**
 * Converts State API configuration to regular format (simplified for Aeriocode only)
 * @param protoConfig The State proto API configuration
 * @returns API configuration
 */
export function convertStateApiConfigurationFromProto(protoConfig: StateApiConfiguration): ApiConfiguration {
	return {
		// Only include Aeriocode-specific fields
		aeriocodeAccountId: protoConfig.aeriocodeAccountId,
		favoritedModelIds: protoConfig.favoritedModelIds || [],

		// Plan mode configurations (Aeriocode only)
		planModeApiProvider: "aeriocode",
		planModeApiModelId: protoConfig.planModeApiModelId,
		planModeThinkingBudgetTokens: protoConfig.planModeThinkingBudgetTokens,
		planModeReasoningEffort: protoConfig.planModeReasoningEffort,

		// Act mode configurations (Aeriocode only)
		actModeApiProvider: "aeriocode",
		actModeApiModelId: protoConfig.actModeApiModelId,
		actModeThinkingBudgetTokens: protoConfig.actModeThinkingBudgetTokens,
		actModeReasoningEffort: protoConfig.actModeReasoningEffort,
	} as ApiConfiguration
}
