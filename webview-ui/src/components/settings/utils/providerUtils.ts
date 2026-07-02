import { ApiConfiguration, ApiProvider, ModelInfo, backendDefaultModelId, backendDefaultModelInfo } from "@shared/api"
import { Mode } from "@shared/storage/types"

/**
 * Interface for normalized API configuration
 */
export interface NormalizedApiConfig {
	selectedProvider: ApiProvider
	selectedModelId: string
	selectedModelInfo: ModelInfo
}

/**
 * Available AerioCode models with their configurations
 */
const AERIOCODE_MODELS: Record<string, ModelInfo> = {
	AerioCode: {
		maxTokens: 32000,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		description: "AerioCode general purpose coding assistant",
	},
	"AerioCode-DO178C": {
		maxTokens: 32000,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		description: "AerioCode specialized for DO-178C compliance",
	},
	"AerioCode-mini": {
		maxTokens: 32000,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		description: "AerioCode mini version",
	},
}

/**
 * Normalizes API configuration to ensure consistent values (Aeriocode only)
 */
export function normalizeApiConfiguration(
	apiConfiguration: ApiConfiguration | undefined,
	currentMode: Mode,
): NormalizedApiConfig {
	// Get the mode-specific fields from the configuration
	const modeFields = getModeSpecificFields(apiConfiguration, currentMode)

	// Use the selected model ID from configuration, fallback to default
	const modelId = modeFields.apiModelId || backendDefaultModelId

	// Look up the model info from our models table, fallback to default
	const modelInfo = AERIOCODE_MODELS[modelId] || backendDefaultModelInfo

	return {
		selectedProvider: "aeriocode",
		selectedModelId: modelId,
		selectedModelInfo: modelInfo,
	}
}

/**
 * Gets mode-specific field values from API configuration (Aeriocode only)
 */
export function getModeSpecificFields(apiConfiguration: ApiConfiguration | undefined, mode: Mode) {
	if (!apiConfiguration) {
		return {
			// Core fields
			apiProvider: undefined,
			apiModelId: undefined,

			// Other mode-specific fields
			thinkingBudgetTokens: undefined,
			reasoningEffort: undefined,
		}
	}

	return {
		// Core fields
		apiProvider: mode === "plan" ? apiConfiguration.planModeApiProvider : apiConfiguration.actModeApiProvider,
		apiModelId: mode === "plan" ? apiConfiguration.planModeApiModelId : apiConfiguration.actModeApiModelId,

		// Other mode-specific fields
		thinkingBudgetTokens:
			mode === "plan" ? apiConfiguration.planModeThinkingBudgetTokens : apiConfiguration.actModeThinkingBudgetTokens,
		reasoningEffort: mode === "plan" ? apiConfiguration.planModeReasoningEffort : apiConfiguration.actModeReasoningEffort,
	}
}

/**
 * Synchronizes mode configurations by copying the source mode's settings to both modes
 * This is used when the "Use different models for Plan and Act modes" toggle is unchecked
 */
export async function syncModeConfigurations(
	apiConfiguration: ApiConfiguration | undefined,
	sourceMode: Mode,
	handleFieldsChange: (updates: Partial<ApiConfiguration>) => Promise<void>,
): Promise<void> {
	if (!apiConfiguration) return

	const sourceFields = getModeSpecificFields(apiConfiguration, sourceMode)
	const { apiProvider } = sourceFields

	if (!apiProvider) return

	// Build the complete update object with both plan and act mode fields
	const updates: Partial<ApiConfiguration> = {
		// Always sync common fields
		planModeApiProvider: sourceFields.apiProvider,
		actModeApiProvider: sourceFields.apiProvider,
		planModeThinkingBudgetTokens: sourceFields.thinkingBudgetTokens,
		actModeThinkingBudgetTokens: sourceFields.thinkingBudgetTokens,
		planModeReasoningEffort: sourceFields.reasoningEffort,
		actModeReasoningEffort: sourceFields.reasoningEffort,
	}

	// Handle Aeriocode-specific fields - no additional fields needed for Aeriocode
	if (apiProvider === "aeriocode") {
		// Aeriocode uses default backend model, no additional configuration needed
	}

	// Make the atomic update
	await handleFieldsChange(updates)
}

/**
 * Gets the Aeriocode authentication URL
 */
export function getAeriocodeAuthUrl() {
	return `https://app.aeriocode.bot/login`
}
