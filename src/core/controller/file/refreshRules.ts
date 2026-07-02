import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { RefreshedRules } from "@shared/proto/aeriocode/file"
import type { Controller } from "../index"
import { refreshAeriocodeRulesToggles } from "@core/context/instructions/user-instructions/aeriocode-rules"
import { refreshExternalRulesToggles } from "@core/context/instructions/user-instructions/external-rules"
import { refreshWorkflowToggles } from "@core/context/instructions/user-instructions/workflows"
import { getCwd, getDesktopDir } from "@/utils/path"

/**
 * Refreshes all rule toggles (Aeriocode, External, and Workflows)
 * @param controller The controller instance
 * @param _request The empty request
 * @returns RefreshedRules containing updated toggles for all rule types
 */
export async function refreshRules(controller: Controller, _request: EmptyRequest): Promise<RefreshedRules> {
	try {
		const cwd = await getCwd(getDesktopDir())
		const { globalToggles, localToggles } = await refreshAeriocodeRulesToggles(controller.context, cwd)
		const { cursorLocalToggles, windsurfLocalToggles } = await refreshExternalRulesToggles(controller.context, cwd)
		const { localWorkflowToggles, globalWorkflowToggles } = await refreshWorkflowToggles(controller.context, cwd)

		return RefreshedRules.create({
			globalAeriocodeRulesToggles: { toggles: globalToggles },
			localAeriocodeRulesToggles: { toggles: localToggles },
			localCursorRulesToggles: { toggles: cursorLocalToggles },
			localWindsurfRulesToggles: { toggles: windsurfLocalToggles },
			localWorkflowToggles: { toggles: localWorkflowToggles },
			globalWorkflowToggles: { toggles: globalWorkflowToggles },
		})
	} catch (error) {
		console.error("Failed to refresh rules:", error)
		throw error
	}
}
