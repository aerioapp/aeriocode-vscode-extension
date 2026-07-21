import { Controller } from ".."
import { AddRequirementRequest, RequirementResponse } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function addRequirement(_controller: Controller, request: AddRequirementRequest): Promise<RequirementResponse> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) throw new Error("Certification not active")
	const id = db.insertRequirement({
		requirement_id: request.requirementId,
		level: request.level,
		title: request.title,
		description: request.description || undefined,
		dal_level: request.dalLevel || undefined,
		parent_requirement_id: request.parentRequirementId || undefined,
		source: request.source || undefined,
		rationale: request.rationale || undefined,
	})
	return RequirementResponse.create({ id, requirementId: request.requirementId })
}
