import { Empty } from "@shared/proto/aeriocode/common"
import { WebviewProviderType, WebviewProviderTypeRequest } from "@shared/proto/aeriocode/ui"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"
import type { Controller } from "../index"

const subscriptions = new Map<StreamingResponseHandler<Empty>, WebviewProviderType>()

export async function subscribeToAuditTrailButtonClicked(
	_controller: Controller,
	request: WebviewProviderTypeRequest,
	responseStream: StreamingResponseHandler<Empty>,
	requestId?: string,
): Promise<void> {
	const providerType = request.providerType
	console.log(`[DEBUG] set up audit trail button subscription for ${WebviewProviderType[providerType]} webview`)

	subscriptions.set(responseStream, providerType)

	const cleanup = () => {
		subscriptions.delete(responseStream)
	}

	if (requestId) {
		getRequestRegistry().registerRequest(
			requestId,
			cleanup,
			{ type: "audit_trail_button_clicked_subscription" },
			responseStream,
		)
	}
}

export async function sendAuditTrailButtonClickedEvent(webviewType?: WebviewProviderType): Promise<void> {
	const promises = Array.from(subscriptions.entries()).map(async ([responseStream, providerType]) => {
		if (webviewType !== undefined && webviewType !== providerType) {
			return
		}

		try {
			const event = Empty.create({})
			await responseStream(event, false)
		} catch (error) {
			console.error(`Error sending audit trail button clicked event to ${WebviewProviderType[providerType]}:`, error)
			subscriptions.delete(responseStream)
		}
	})

	await Promise.all(promises)
}
