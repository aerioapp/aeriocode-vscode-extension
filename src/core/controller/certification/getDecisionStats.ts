import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { DecisionStatsResponse } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function getDecisionStats(_controller: Controller, _request: EmptyRequest): Promise<DecisionStatsResponse> {
	const certManager = CertificationManager.getInstance()
	const auditService = certManager.getAuditService()
	if (!auditService)
		return DecisionStatsResponse.create({ total: 0, accepted: 0, modified: 0, rejected: 0, avgDecisionTimeMs: 0 })
	const stats = auditService.getDecisionStats()
	return DecisionStatsResponse.create({
		total: stats.total,
		accepted: stats.accepted,
		modified: stats.modified,
		rejected: stats.rejected,
		avgDecisionTimeMs: stats.avgDecisionTimeMs,
	})
}
