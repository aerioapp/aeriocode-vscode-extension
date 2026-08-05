import { Empty } from "@shared/proto/aeriocode/common"
import { WebviewProviderType, WebviewProviderTypeRequest } from "@shared/proto/aeriocode/ui"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"
import type { Controller } from "../index"

/**
 * Lets the extension host open the verification panel — the DO-178C tools: structural coverage,
 * ReqIF traceability, test generation, document drafts and the DO-330 qualification position.
 *
 * The command palette entry only broadcasts; the webview owns the navigation, exactly as it does
 * for settings, history, traceability and compliance. Hardcoding a provider type here would fail
 * when the command is run from the editor-tab webview's title bar rather than the sidebar.
 */

const subscriptions = new Map<StreamingResponseHandler<Empty>, WebviewProviderType>()

export async function subscribeToVerificationButtonClicked(
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
			{ type: "verification_button_clicked_subscription" },
			responseStream,
		)
	}
}

export async function sendVerificationButtonClickedEvent(webviewType?: WebviewProviderType): Promise<void> {
	const promises = Array.from(subscriptions.entries()).map(async ([responseStream, providerType]) => {
		if (webviewType !== undefined && webviewType !== providerType) {
			return
		}

		try {
			await responseStream(Empty.create({}), false)
		} catch (error) {
			console.error(`Error sending verification button clicked event to ${WebviewProviderType[providerType]}:`, error)
			subscriptions.delete(responseStream)
		}
	})

	await Promise.all(promises)
}
