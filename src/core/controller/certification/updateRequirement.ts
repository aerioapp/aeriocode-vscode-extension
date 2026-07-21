import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { UpdateRequirementRequest } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function updateRequirement(_controller: Controller, request: UpdateRequirementRequest): Promise<Empty> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) throw new Error("Certification not active")
	db.updateRequirement(request.requirementId, {
		title: request.title || undefined,
		description: request.description || undefined,
		dal_level: request.dalLevel || undefined,
		status: request.status || undefined,
		rationale: request.rationale || undefined,
	})
	return Empty.create()
}
