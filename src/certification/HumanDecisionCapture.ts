import type { AuditTrailService } from "./AuditTrailService"
import type { ProjectDatabase } from "./db/ProjectDatabase"
import type { DecisionParams } from "./types"

/**
 * HumanDecisionCapture - Captures engineer decisions on AI suggestions.
 * Records accept/modify/reject with rationale for audit trail compliance.
 */
export class HumanDecisionCapture {
	private auditService: AuditTrailService
	private db: ProjectDatabase

	constructor(auditService: AuditTrailService, db: ProjectDatabase) {
		this.auditService = auditService
		this.db = db
	}

	/**
	 * Capture a human decision on an AI suggestion.
	 */
	async captureDecision(params: DecisionParams): Promise<void> {
		const now = new Date().toISOString()
		const generation = this.db.getGeneration(params.generation_id)

		const decisionId = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

		this.db.insertDecision({
			decision_id: decisionId,
			generation_id: params.generation_id,
			user_id: params.user_id,
			decision: params.decision,
			files_affected: params.files_affected,
			diff_summary: params.diff_summary,
			rationale: params.rationale,
			compliance_notes: params.compliance_notes,
			presented_at: generation?.completed_at || undefined,
			decided_at: now,
			decision_duration_ms: generation?.completed_at
				? new Date(now).getTime() - new Date(generation.completed_at).getTime()
				: undefined,
		})

		await this.auditService.recordEvent({
			event_type: "human_decision",
			event_action: params.decision,
			user_id: params.user_id,
			entity_type: "ai_suggestion",
			entity_id: params.generation_id,
			model_id: generation?.model_id || undefined,
			payload: {
				decision_id: decisionId,
				generation_id: params.generation_id,
				decision: params.decision,
				files_affected: params.files_affected || [],
				rationale: params.rationale || null,
				modifications_summary: params.diff_summary || null,
			},
		})
	}

	/**
	 * Capture an accepted decision.
	 */
	async captureAccepted(generationId: string, userId: string, filesAffected?: string[]): Promise<void> {
		await this.captureDecision({
			generation_id: generationId,
			user_id: userId,
			decision: "accepted",
			files_affected: filesAffected,
		})
	}

	/**
	 * Capture a rejected decision with optional rationale.
	 */
	async captureRejected(generationId: string, userId: string, rationale?: string): Promise<void> {
		await this.captureDecision({
			generation_id: generationId,
			user_id: userId,
			decision: "rejected",
			rationale,
		})
	}

	/**
	 * Capture a modified decision with summary of changes.
	 */
	async captureModified(generationId: string, userId: string, modificationsSummary: string, rationale?: string): Promise<void> {
		await this.captureDecision({
			generation_id: generationId,
			user_id: userId,
			decision: "modified",
			diff_summary: modificationsSummary,
			rationale,
		})
	}
}
