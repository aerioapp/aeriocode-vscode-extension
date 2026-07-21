import { Controller } from ".."
import { AuditQueryRequest, GenerationHistoryResponse, GenerationEntry } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function getGenerationHistory(
	_controller: Controller,
	request: AuditQueryRequest,
): Promise<GenerationHistoryResponse> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) return GenerationHistoryResponse.create({ generations: [] })

	const rows = db.queryGenerations({
		user_id: request.userId || undefined,
		start_date: request.startDate || undefined,
		end_date: request.endDate || undefined,
		limit: request.limit || 100,
		offset: request.offset || 0,
	})

	const generations = rows.map((row) =>
		GenerationEntry.create({
			generationId: row.generation_id,
			modelId: row.model_id,
			userMessage: row.user_message || "",
			filesWritten: JSON.parse(row.files_written || "[]"),
			timestamp: row.started_at || row.created_at,
			decision: "", // Decision is linked via human_decisions table, not stored on generation
		}),
	)

	return GenerationHistoryResponse.create({ generations })
}
