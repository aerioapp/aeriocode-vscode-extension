import { Controller } from "../index"
import { Empty, EmptyRequest } from "@shared/proto/aeriocode/common"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"

const activeSubscriptions = new Map<string, StreamingResponseHandler<Empty>>()

export async function subscribeToWorktreesButtonClicked(
	controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<Empty>,
	requestId?: string,
): Promise<void> {
	const controllerId = controller.id
	activeSubscriptions.set(controllerId, responseStream)

	const cleanup = () => {
		activeSubscriptions.delete(controllerId)
	}

	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "worktrees_button_subscription" }, responseStream)
	}
}

export async function sendWorktreesButtonClickedEvent(controllerId: string): Promise<void> {
	const responseStream = activeSubscriptions.get(controllerId)

	if (!responseStream) {
		return
	}

	try {
		const event: Empty = Empty.create({})
		await responseStream(event, false)
	} catch (error) {
		console.error(`Error sending worktrees button clicked event to controller ${controllerId}:`, error)
		activeSubscriptions.delete(controllerId)
	}
}
