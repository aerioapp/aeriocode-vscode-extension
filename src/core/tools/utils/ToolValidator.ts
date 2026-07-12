import type { ToolParamName, ToolUse } from "@core/assistant-message"
import type { AeriocodeIgnoreController } from "@core/ignore/AeriocodeIgnoreController"

export type ValidationResult = { ok: true } | { ok: false; error: string }

/**
 * Lightweight validator used by new tool handlers.
 * Validates required parameters and path access for AerioCode tools.
 */
export class ToolValidator {
	constructor(private readonly aeriocodeIgnoreController: AeriocodeIgnoreController) {}

	/**
	 * Verifies required parameters exist on the tool block.
	 * Returns a message suitable for displaying in an error.
	 */
	assertRequiredParams(block: ToolUse, ...params: ToolParamName[]): ValidationResult {
		for (const p of params) {
			const val = (block as any)?.params?.[p]
			if (val === undefined || val === null || String(val).trim() === "") {
				return { ok: false, error: `Missing required parameter '${p}' for tool '${block.name}'.` }
			}
		}
		return { ok: true }
	}

	/**
	 * Verifies access is allowed to a given path via .aeriocodeignore rules.
	 * Callers should pass a repo-relative (workspace-relative) path.
	 */
	checkAeriocodeIgnorePath(relPath: string): ValidationResult {
		const accessAllowed = this.aeriocodeIgnoreController.validateAccess(relPath)
		if (!accessAllowed) {
			return {
				ok: false,
				error: `Access to path '${relPath}' is blocked by .aeriocodeignore settings.`,
			}
		}
		return { ok: true }
	}
}
