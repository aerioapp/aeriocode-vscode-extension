import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { RequirementsResponse, Requirement } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function getRequirements(_controller: Controller, _request: EmptyRequest): Promise<RequirementsResponse> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) return RequirementsResponse.create({ requirements: [] })
	const reqs = db.getAllRequirements()
	return RequirementsResponse.create({
		requirements: reqs.map((r) =>
			Requirement.create({
				id: r.id,
				requirementId: r.requirement_id,
				level: r.level,
				title: r.title,
				description: r.description || "",
				dalLevel: r.dal_level || "",
				status: r.status,
				parentRequirementId: r.parent_requirement_id || "",
				source: r.source || "",
				rationale: r.rationale || "",
				createdAt: r.created_at,
				updatedAt: r.updated_at,
			}),
		),
	})
}
