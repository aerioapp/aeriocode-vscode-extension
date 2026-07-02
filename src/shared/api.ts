import type { LanguageModelChatSelector } from "../api/providers/types"

export type ApiProvider = "aeriocode"

export interface ApiHandlerOptions {
	// Global configuration (not mode-specific)
	aeriocodeAccountId?: string
	taskId?: string // Used to identify the task in API requests
	onRetryAttempt?: (attempt: number, maxRetries: number, delay: number, error: any) => void
	context?: {
		cwd?: string
		osName?: string
		shell?: string
		homeDir?: string
		browserWidth?: number
		browserHeight?: number
		mcpServers?: any[]
		browserSettings?: any
	}
	// Plan mode configurations
	planModeApiModelId?: string
	planModeThinkingBudgetTokens?: number
	planModeReasoningEffort?: string
	// Act mode configurations
	actModeApiModelId?: string
	actModeThinkingBudgetTokens?: number
	actModeReasoningEffort?: string
}

export type ApiConfiguration = ApiHandlerOptions & {
	planModeApiProvider?: ApiProvider
	actModeApiProvider?: ApiProvider
	favoritedModelIds?: string[]
}

// Models

interface PriceTier {
	tokenLimit: number // Upper limit (inclusive) of *input* tokens for this price. Use Infinity for the highest tier.
	price: number // Price per million tokens for this tier.
}

export interface ModelInfo {
	maxTokens?: number
	contextWindow?: number
	supportsImages?: boolean
	supportsPromptCache: boolean // this value is hardcoded for now
	inputPrice?: number // Keep for non-tiered input models
	outputPrice?: number // Keep for non-tiered output models
	thinkingConfig?: {
		maxBudget?: number // Max allowed thinking budget tokens
		outputPrice?: number // Output price per million tokens when budget > 0
		outputPriceTiers?: PriceTier[] // Optional: Tiered output price when budget > 0
	}
	supportsGlobalEndpoint?: boolean // Whether the model supports a global endpoint with Vertex AI
	cacheWritesPrice?: number
	cacheReadsPrice?: number
	description?: string
	tiers?: {
		contextWindow: number
		inputPrice?: number
		outputPrice?: number
		cacheWritesPrice?: number
		cacheReadsPrice?: number
	}[]
}

// Backend (Aeriocode) - Uses OpenAI-compatible API
export const backendDefaultModelId = "AerioCode"
export const backendDefaultModelInfo: ModelInfo = {
	maxTokens: 32000,
	contextWindow: 1_000_000,
	supportsImages: false,
	supportsPromptCache: false,
	inputPrice: 0,
	outputPrice: 0,
	description: "Aeriocode backend AI service through OpenAI-compatible API",
}
