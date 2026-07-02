import path from "path"
import { GlobalFileNames, ensureWorkflowsDirectoryExists } from "@core/storage/disk"
import { AeriocodeRulesToggles } from "@shared/aeriocode-rules"
import { getWorkspaceState, updateWorkspaceState, getGlobalState, updateGlobalState } from "@core/storage/state"
import * as vscode from "vscode"
import { synchronizeRuleToggles } from "@core/context/instructions/user-instructions/rule-helpers"

/**
 * Refresh the workflow toggles
 */
export async function refreshWorkflowToggles(
	context: vscode.ExtensionContext,
	workingDirectory: string,
): Promise<{
	globalWorkflowToggles: AeriocodeRulesToggles
	localWorkflowToggles: AeriocodeRulesToggles
}> {
	// Global workflows
	const globalWorkflowToggles = ((await getGlobalState(context, "globalWorkflowToggles")) as AeriocodeRulesToggles) || {}
	const globalAeriocodeWorkflowsFilePath = await ensureWorkflowsDirectoryExists()
	const updatedGlobalWorkflowToggles = await synchronizeRuleToggles(globalAeriocodeWorkflowsFilePath, globalWorkflowToggles)
	await updateGlobalState(context, "globalWorkflowToggles", updatedGlobalWorkflowToggles)

	const workflowRulesToggles = ((await getWorkspaceState(context, "workflowToggles")) as AeriocodeRulesToggles) || {}
	const workflowsDirPath = path.resolve(workingDirectory, GlobalFileNames.workflows)
	const updatedWorkflowToggles = await synchronizeRuleToggles(workflowsDirPath, workflowRulesToggles)
	await updateWorkspaceState(context, "workflowToggles", updatedWorkflowToggles)

	return {
		globalWorkflowToggles: updatedGlobalWorkflowToggles,
		localWorkflowToggles: updatedWorkflowToggles,
	}
}
