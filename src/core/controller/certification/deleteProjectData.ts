import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { CertificationManager } from "@/certification"
import { telemetryService } from "@/services/telemetry"
import { Logger } from "@/services/logging/Logger"
import * as vscode from "vscode"

export async function deleteProjectData(controller: Controller): Promise<Empty> {
	try {
		const certManager = CertificationManager.getInstance()
		await certManager.deleteProjectData()

		// Update VS Code context so when clauses evaluate correctly
		vscode.commands.executeCommand("setContext", "aeriocode.certificationActive", false)

		// Update webview state
		await controller.postStateToWebview()

		telemetryService.captureButtonClick("certification_delete_data")
	} catch (error) {
		Logger.log("[Certification] Failed to delete project data: " + error)
		throw error
	}
	return Empty.create()
}
