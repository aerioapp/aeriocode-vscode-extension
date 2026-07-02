import type { ToggleWindsurfRuleRequest } from "@shared/proto/aeriocode/file"
import { AeriocodeRulesToggles } from "@shared/proto/aeriocode/file"
import type { Controller } from "../index"
import { getWorkspaceState, updateWorkspaceState } from "../../../core/storage/state"
import { AeriocodeRulesToggles as AppAeriocodeRulesToggles } from "@shared/aeriocode-rules"

/**
 * Toggles a Windsurf rule (enable or disable)
 * @param controller The controller instance
 * @param request The toggle request
 * @returns The updated Windsurf rule toggles
 */
export async function toggleWindsurfRule(
	controller: Controller,
	request: ToggleWindsurfRuleRequest,
): Promise<AeriocodeRulesToggles> {
	const { rulePath, enabled } = request

	if (!rulePath || typeof enabled !== "boolean") {
		console.error("toggleWindsurfRule: Missing or invalid parameters", {
			rulePath,
			enabled: typeof enabled === "boolean" ? enabled : `Invalid: ${typeof enabled}`,
		})
		throw new Error("Missing or invalid parameters for toggleWindsurfRule")
	}

	// Update the toggles
	const toggles = ((await getWorkspaceState(controller.context, "localWindsurfRulesToggles")) as AppAeriocodeRulesToggles) || {}
	toggles[rulePath] = enabled
	await updateWorkspaceState(controller.context, "localWindsurfRulesToggles", toggles)

	// Return the toggles directly
	return AeriocodeRulesToggles.create({ toggles: toggles })
}
