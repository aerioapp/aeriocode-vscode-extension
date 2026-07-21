import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { ExportResponse } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"
import { ExportService } from "@/certification/ExportService"

export async function exportVerificationPackage(_controller: Controller, _request: EmptyRequest): Promise<ExportResponse> {
	try {
		const certManager = CertificationManager.getInstance()
		const db = certManager.getProjectDb()
		const auditService = certManager.getAuditService()
		if (!db || !auditService) throw new Error("Certification not active")
		const exportService = new ExportService(db, auditService)
		const dirPath = await exportService.exportVerificationPackage()
		return ExportResponse.create({ filePath: dirPath, success: true, error: "" })
	} catch (e) {
		return ExportResponse.create({ filePath: "", success: false, error: String(e) })
	}
}
