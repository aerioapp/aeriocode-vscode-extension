import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { IntegrityResponse } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function verifyIntegrity(_controller: Controller, _request: EmptyRequest): Promise<IntegrityResponse> {
	const certManager = CertificationManager.getInstance()
	const auditService = certManager.getAuditService()
	if (!auditService) return IntegrityResponse.create({ valid: false, totalEntries: 0, brokenAt: 0, lastChecked: "" })
	const result = auditService.verifyIntegrity()
	return IntegrityResponse.create({
		valid: result.valid,
		totalEntries: result.totalEntries,
		brokenAt: result.brokenAt || 0,
		lastChecked: new Date().toISOString(),
	})
}
