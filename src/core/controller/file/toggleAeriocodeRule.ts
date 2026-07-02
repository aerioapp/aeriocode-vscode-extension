import { ToggleAeriocodeRules } from "@shared/proto/aeriocode/file"
import type { ToggleAeriocodeRuleRequest } from "@shared/proto/aeriocode/file"
import type { Controller } from "../index"
import { getGlobalState, getWorkspaceState, updateGlobalState, updateWorkspaceState } from "../../../core/storage/state"
import { AeriocodeRulesToggles as AppAeriocodeRulesToggles } from "@shared/aeriocode-rules"

/**
 * Toggles a Aeriocode rule (enable or disable)
 * @param controller The controller instance
 * @param request The toggle request
 * @returns The updated Aeriocode rule toggles
 */
export async function toggleAeriocodeRule(
	controller: Controller,
	request: ToggleAeriocodeRuleRequest,
): Promise<ToggleAeriocodeRules> {
	const { isGlobal, rulePath, enabled } = request

	if (!rulePath || typeof enabled !== "boolean" || typeof isGlobal !== "boolean") {
		console.error("toggleAeriocodeRule: Missing or invalid parameters", {
			rulePath,
			isGlobal: typeof isGlobal === "boolean" ? isGlobal : `Invalid: ${typeof isGlobal}`,
			enabled: typeof enabled === "boolean" ? enabled : `Invalid: ${typeof enabled}`,
		})
		throw new Error("Missing or invalid parameters for toggleAeriocodeRule")
	}

	// This is the same core logic as in the original handler
	if (isGlobal) {
		const toggles =
			((await getGlobalState(controller.context, "globalAeriocodeRulesToggles")) as AppAeriocodeRulesToggles) || {}
		toggles[rulePath] = enabled
		await updateGlobalState(controller.context, "globalAeriocodeRulesToggles", toggles)
	} else {
		const toggles =
			((await getWorkspaceState(controller.context, "localAeriocodeRulesToggles")) as AppAeriocodeRulesToggles) || {}
		toggles[rulePath] = enabled
		await updateWorkspaceState(controller.context, "localAeriocodeRulesToggles", toggles)
	}

	// Get the current state to return in the response
	const globalToggles =
		((await getGlobalState(controller.context, "globalAeriocodeRulesToggles")) as AppAeriocodeRulesToggles) || {}
	const localToggles =
		((await getWorkspaceState(controller.context, "localAeriocodeRulesToggles")) as AppAeriocodeRulesToggles) || {}

	return ToggleAeriocodeRules.create({
		globalAeriocodeRulesToggles: { toggles: globalToggles },
		localAeriocodeRulesToggles: { toggles: localToggles },
	})
}
