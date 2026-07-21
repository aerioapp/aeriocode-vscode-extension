import { Controller } from ".."
import { Int64Request, Empty } from "@shared/proto/aeriocode/common"
import { CertificationManager } from "@/certification"

export async function deleteTraceLink(_controller: Controller, request: Int64Request): Promise<Empty> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) throw new Error("Certification not active")
	db.deleteLink(Number(request.value))
	return Empty.create()
}
