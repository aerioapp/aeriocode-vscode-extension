import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { TraceabilityMatrixResponse, TraceabilityMatrixRow } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function getTraceabilityMatrix(
	_controller: Controller,
	_request: EmptyRequest,
): Promise<TraceabilityMatrixResponse> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) return TraceabilityMatrixResponse.create({ rows: [] })
	const reqs = db.getAllRequirements()
	const links = db.getAllLinks()
	const rows = reqs.map((req) => {
		const reqLinks = links.filter((l) => l.requirement_id === req.requirement_id)
		return TraceabilityMatrixRow.create({
			requirementId: req.requirement_id,
			requirementLevel: req.level,
			title: req.title,
			dalLevel: req.dal_level || "",
			status: req.status,
			linkedSourceFiles: reqLinks.filter((l) => l.artifact_type === "source_code").map((l) => l.artifact_path || ""),
			linkedTestFiles: reqLinks
				.filter((l) => l.artifact_type === "test_case" || l.artifact_type === "test_result")
				.map((l) => l.artifact_path || ""),
			linkedDocuments: reqLinks.filter((l) => l.artifact_type === "document").map((l) => l.artifact_path || ""),
			coveragePercent: reqLinks.length > 0 ? 100 : 0,
		})
	})
	return TraceabilityMatrixResponse.create({ rows })
}
