import { Controller } from "../index"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { ShowWebviewEvent } from "@shared/proto/aeriocode/ui"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"

const activeSubscriptions = new Map<string, StreamingResponseHandler<ShowWebviewEvent>>()

export async function subscribeToShowWebview(
	controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<ShowWebviewEvent>,
	requestId?: string,
): Promise<void> {
	const controllerId = controller.id
	activeSubscriptions.set(controllerId, responseStream)

	const cleanup = () => {
		activeSubscriptions.delete(controllerId)
	}

	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "show_webview_subscription" }, responseStream)
	}
}

export async function sendShowWebviewEvent(controllerId: string): Promise<void> {
	const responseStream = activeSubscriptions.get(controllerId)

	if (!responseStream) {
		return
	}

	try {
		const event: ShowWebviewEvent = ShowWebviewEvent.create({})
		await responseStream(event, false)
	} catch (error) {
		console.error(`Error sending show webview event to controller ${controllerId}:`, error)
		activeSubscriptions.delete(controllerId)
	}
}
