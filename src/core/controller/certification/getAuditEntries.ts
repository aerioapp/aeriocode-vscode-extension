import { Controller } from ".."
import { AuditQueryRequest, AuditEntriesResponse, AuditEntry } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function getAuditEntries(_controller: Controller, request: AuditQueryRequest): Promise<AuditEntriesResponse> {
	const certManager = CertificationManager.getInstance()
	const auditService = certManager.getAuditService()
	if (!auditService) return AuditEntriesResponse.create({ entries: [], totalCount: 0 })
	const entries = auditService.queryEvents({
		event_type: request.eventType || undefined,
		user_id: request.userId || undefined,
		start_date: request.startDate || undefined,
		end_date: request.endDate || undefined,
		limit: request.limit || 1000,
		offset: request.offset || 0,
	})
	const db = certManager.getProjectDb()
	const totalCount = db ? db.getAuditCount() : 0
	return AuditEntriesResponse.create({
		entries: entries.map((e) =>
			AuditEntry.create({
				id: e.id,
				entryHash: e.entry_hash,
				previousHash: e.previous_hash || "",
				eventType: e.event_type,
				eventAction: e.event_action,
				userId: e.user_id || "",
				sessionId: e.session_id || "",
				taskId: e.task_id || "",
				timestamp: e.timestamp,
				entityType: e.entity_type || "",
				entityId: e.entity_id || "",
				modelId: e.model_id || "",
				modelVersion: e.model_version || "",
				profileId: e.profile_id || 0,
				payload: e.payload,
			}),
		),
		totalCount,
	})
}
