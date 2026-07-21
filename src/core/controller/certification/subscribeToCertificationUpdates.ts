import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { CertificationUpdate } from "@shared/proto/aeriocode/certification"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"
import { CertificationManager } from "@/certification"

export async function subscribeToCertificationUpdates(
	_controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<CertificationUpdate>,
	requestId?: string,
): Promise<void> {
	const certManager = CertificationManager.getInstance()

	const disposable = certManager.onCertificationEvent((event) => {
		try {
			responseStream(
				CertificationUpdate.create({
					updateType: event.type,
					entityType: event.entityType,
					entityId: event.entityId,
					payload: event.payload,
					timestamp: event.timestamp,
				}),
			)
		} catch {
			// Stream may be closed — remove listener
			disposable.dispose()
		}
	})

	if (requestId) {
		getRequestRegistry().registerRequest(
			requestId,
			async () => {
				disposable.dispose()
			},
			{ isSubscription: true },
			responseStream,
		)
	}
}
