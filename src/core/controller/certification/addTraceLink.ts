import { Controller } from ".."
import { AddTraceLinkRequest, TraceLinkResponse } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function addTraceLink(_controller: Controller, request: AddTraceLinkRequest): Promise<TraceLinkResponse> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) throw new Error("Certification not active")
	const id = db.insertTraceLink({
		requirement_id: request.requirementId,
		artifact_type: request.artifactType,
		artifact_path: request.artifactPath || undefined,
		artifact_line_start: request.artifactLineStart || undefined,
		artifact_line_end: request.artifactLineEnd || undefined,
		link_type: request.linkType,
	})
	return TraceLinkResponse.create({ id })
}
