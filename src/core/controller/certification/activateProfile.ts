import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { ActivateProfileRequest } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"
import { ProfileLoader } from "@/certification/ProfileLoader"
import { telemetryService } from "@/services/telemetry"
import { Logger } from "@/services/logging/Logger"
import * as vscode from "vscode"

export async function activateProfile(controller: Controller, request: ActivateProfileRequest): Promise<Empty> {
	try {
		const certManager = CertificationManager.getInstance()
		const profile = ProfileLoader.loadProfileByName(request.standard)
		if (!profile) {
			throw new Error(`[Certification] Profile not found: ${request.standard}`)
		}
		await certManager.activateProfile(profile, request.level)

		// Verify activation succeeded
		const status = certManager.getStatus()
		if (!status.active) {
			throw new Error("[Certification] Profile activation did not result in active status")
		}

		// Update VS Code context so when clauses evaluate correctly
		vscode.commands.executeCommand("setContext", "aeriocode.certificationActive", true)

		// Update webview state
		await controller.postStateToWebview()

		telemetryService.captureButtonClick(`certification_activate_${request.standard}_${request.level}`)
	} catch (error) {
		Logger.log("[Certification] Failed to activate profile: " + error)
		throw error
	}
	return Empty.create()
}
