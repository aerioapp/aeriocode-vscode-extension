import { Controller } from ".."
import { Metadata } from "@shared/proto/aeriocode/common"
import { ToggleWorkflowRequest, AeriocodeRulesToggles } from "@shared/proto/aeriocode/file"
import { getWorkspaceState, updateWorkspaceState, getGlobalState, updateGlobalState } from "../../../core/storage/state"
import { AeriocodeRulesToggles as AppAeriocodeRulesToggles } from "../../../shared/aeriocode-rules"

/**
 * Toggles a workflow on or off
 * @param controller The controller instance
 * @param request The request containing the workflow path and enabled state
 * @returns The updated workflow toggles
 */
export async function toggleWorkflow(controller: Controller, request: ToggleWorkflowRequest): Promise<AeriocodeRulesToggles> {
	const { workflowPath, enabled, isGlobal } = request

	if (!workflowPath || typeof enabled !== "boolean") {
		console.error("toggleWorkflow: Missing or invalid parameters", {
			workflowPath,
			enabled: typeof enabled === "boolean" ? enabled : `Invalid: ${typeof enabled}`,
		})
		throw new Error("Missing or invalid parameters for toggleWorkflow")
	}

	// Update the toggles based on isGlobal flag
	if (isGlobal) {
		// Global workflows
		const toggles = ((await getGlobalState(controller.context, "globalWorkflowToggles")) as AppAeriocodeRulesToggles) || {}
		toggles[workflowPath] = enabled
		await updateGlobalState(controller.context, "globalWorkflowToggles", toggles)
		await controller.postStateToWebview()

		// Return the global toggles
		return AeriocodeRulesToggles.create({ toggles: toggles })
	} else {
		// Workspace workflows
		const toggles = ((await getWorkspaceState(controller.context, "workflowToggles")) as AppAeriocodeRulesToggles) || {}
		toggles[workflowPath] = enabled
		await updateWorkspaceState(controller.context, "workflowToggles", toggles)
		await controller.postStateToWebview()

		// Return the workspace toggles
		return AeriocodeRulesToggles.create({ toggles: toggles })
	}
}
