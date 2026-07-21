import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { AskResponseRequest } from "@shared/proto/aeriocode/task"
import { AeriocodeAskResponse } from "../../../shared/WebviewMessage"
import { CertificationManager } from "@/certification"

/**
 * Handles a response from the webview for a previous ask operation
 *
 * @param controller The controller instance
 * @param request The request containing response type, optional text and optional images
 * @returns Empty response
 */
export async function askResponse(controller: Controller, request: AskResponseRequest): Promise<Empty> {
	try {
		if (!controller.task) {
			console.warn("askResponse: No active task to receive response")
			return Empty.create()
		}

		// Map the string responseType to the AeriocodeAskResponse enum
		let responseType: AeriocodeAskResponse
		switch (request.responseType) {
			case "yesButtonClicked":
				responseType = "yesButtonClicked"
				break
			case "noButtonClicked":
				responseType = "noButtonClicked"
				break
			case "messageResponse":
				responseType = "messageResponse"
				break
			default:
				console.warn(`askResponse: Unknown response type: ${request.responseType}`)
				return Empty.create()
		}

		// Capture human decision for certification audit trail
		// Only capture for approval/rejection decisions (not message responses)
		if (responseType === "yesButtonClicked" || responseType === "noButtonClicked") {
			try {
				const certManager = CertificationManager.getInstance()
				if (certManager.getStatus().active && controller.task?.taskId) {
					const decision = responseType === "yesButtonClicked" ? "accepted" : "rejected"
					await certManager.onHumanDecision({
						generation_id: controller.task.taskId,
						user_id: controller.id,
						decision,
						rationale: request.text || undefined,
					})
				}
			} catch (certError) {
				// Certification is optional - don't break the main flow
				console.debug("Certification decision capture skipped:", certError)
			}
		}

		// Call the task's handler for webview responses
		await controller.task.handleWebviewAskResponse(responseType, request.text, request.images, request.files)

		return Empty.create()
	} catch (error) {
		console.error("Error in askResponse handler:", error)
		throw error
	}
}
