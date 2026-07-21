import { Controller } from ".."
import { StringRequest } from "@shared/proto/aeriocode/common"
import { TraceabilityLinksResponse, TraceabilityLink } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function getTraceabilityLinks(_controller: Controller, request: StringRequest): Promise<TraceabilityLinksResponse> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) return TraceabilityLinksResponse.create({ links: [] })
	const links = db.getLinksForArtifact(request.value)
	return TraceabilityLinksResponse.create({
		links: links.map((l) =>
			TraceabilityLink.create({
				id: l.id,
				requirementId: l.requirement_id,
				artifactType: l.artifact_type,
				artifactPath: l.artifact_path || "",
				artifactLineStart: l.artifact_line_start || 0,
				artifactLineEnd: l.artifact_line_end || 0,
				linkType: l.link_type,
				confidence: l.confidence,
				isVerified: l.is_verified === 1,
				createdAt: l.created_at,
			}),
		),
	})
}
