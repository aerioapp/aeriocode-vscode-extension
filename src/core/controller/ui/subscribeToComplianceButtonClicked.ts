import { Empty } from "@shared/proto/aeriocode/common"
import { WebviewProviderType, WebviewProviderTypeRequest } from "@shared/proto/aeriocode/ui"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"
import type { Controller } from "../index"

/**
 * Lets the extension host open the compliance panel — the command palette entry and the
 * editor title action both go through here, so the webview owns the navigation exactly as
 * it does for settings, history and traceability.
 */

const subscriptions = new Map<StreamingResponseHandler<Empty>, WebviewProviderType>()

export async function subscribeToComplianceButtonClicked(
	_controller: Controller,
	request: WebviewProviderTypeRequest,
	responseStream: StreamingResponseHandler<Empty>,
	requestId?: string,
): Promise<void> {
	subscriptions.set(responseStream, request.providerType)

	const cleanup = () => {
		subscriptions.delete(responseStream)
	}

	if (requestId) {
		getRequestRegistry().registerRequest(
			requestId,
			cleanup,
			{ type: "compliance_button_clicked_subscription" },
			responseStream,
		)
	}
}

export async function sendComplianceButtonClickedEvent(webviewType?: WebviewProviderType): Promise<void> {
	const promises = Array.from(subscriptions.entries()).map(async ([responseStream, providerType]) => {
		if (webviewType !== undefined && webviewType !== providerType) {
			return
		}

		try {
			await responseStream(Empty.create({}), false)
		} catch (error) {
			console.error(`Error sending compliance button clicked event to ${WebviewProviderType[providerType]}:`, error)
			subscriptions.delete(responseStream)
		}
	})

	await Promise.all(promises)
}
