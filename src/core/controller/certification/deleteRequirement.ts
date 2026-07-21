import { Controller } from ".."
import { StringRequest, Empty } from "@shared/proto/aeriocode/common"
import { CertificationManager } from "@/certification"

export async function deleteRequirement(_controller: Controller, request: StringRequest): Promise<Empty> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) throw new Error("Certification not active")
	db.updateRequirement(request.value, { status: "withdrawn" })
	return Empty.create()
}
