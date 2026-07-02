import { ApiHandler } from "@api/index"

/**
 * Gets context window information for the given API handler
 *
 * @param api The API handler to get context window information for
 * @returns An object containing the raw context window size and the effective max allowed size
 */
export function getContextWindowInfo(api: ApiHandler) {
	const contextWindow = api.getModel().info.contextWindow || 1_000_000 // Default to Aeriocode's context window

	// For Aeriocode provider, use a conservative buffer
	const maxAllowedSize = Math.max(contextWindow - 40_000, contextWindow * 0.8)

	return { contextWindow, maxAllowedSize }
}
