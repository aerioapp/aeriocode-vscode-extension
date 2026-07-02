import type { LanguageModelChatSelector } from "../api/providers/types"

export const SELECTOR_SEPARATOR = "/"

export function stringifyVsCodeLmModelSelector(selector: LanguageModelChatSelector): string {
	return [selector.vendor, selector.family, selector.version, selector.id].filter(Boolean).join(SELECTOR_SEPARATOR)
}
