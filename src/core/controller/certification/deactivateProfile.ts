import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { CertificationManager } from "@/certification"
import { telemetryService } from "@/services/telemetry"
import { Logger } from "@/services/logging/Logger"
import * as vscode from "vscode"

export async function deactivateProfile(controller: Controller): Promise<Empty> {
	try {
		const certManager = CertificationManager.getInstance()
		await certManager.deactivateProfile()

		// Update VS Code context so when clauses evaluate correctly
		vscode.commands.executeCommand("setContext", "aeriocode.certificationActive", false)

		// Update webview state
		await controller.postStateToWebview()

		telemetryService.captureButtonClick("certification_deactivate")
	} catch (error) {
		Logger.log("[Certification] Failed to deactivate profile: " + error)
		throw error
	}
	return Empty.create()
}
