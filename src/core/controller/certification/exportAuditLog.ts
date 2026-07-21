import { Controller } from ".."
import { ExportRequest, ExportResponse } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"
import { ExportService } from "@/certification/ExportService"

export async function exportAuditLog(_controller: Controller, request: ExportRequest): Promise<ExportResponse> {
	try {
		const certManager = CertificationManager.getInstance()
		const db = certManager.getProjectDb()
		const auditService = certManager.getAuditService()
		if (!db || !auditService) throw new Error("Certification not active")
		const exportService = new ExportService(db, auditService)
		const filePath = await exportService.exportAuditLog({ format: (request.format as "csv" | "xlsx") || "csv" })
		return ExportResponse.create({ filePath, success: true, error: "" })
	} catch (e) {
		return ExportResponse.create({ filePath: "", success: false, error: String(e) })
	}
}
