import { Controller } from ".."
import { GetImpactAnalysisRequest, ImpactAnalysisResponse, ImpactFile, ImpactTest } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

export async function getImpactAnalysis(
	_controller: Controller,
	request: GetImpactAnalysisRequest,
): Promise<ImpactAnalysisResponse> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) {
		return ImpactAnalysisResponse.create({
			requirementId: request.requirementId,
			affectedFiles: [],
			affectedTests: [],
			cascadingRequirements: [],
		})
	}

	// Get all links for this requirement
	const links = db.getAllLinks().filter((l) => l.requirement_id === request.requirementId)

	// Separate source files from test files
	const affectedFiles: ImpactFile[] = []
	const affectedTests: ImpactTest[] = []
	const testPatterns = [".test.", ".spec.", "_test.", "test_"]

	for (const link of links) {
		const isTest = testPatterns.some((p) => (link.artifact_path || "").includes(p))

		if (isTest) {
			affectedTests.push(
				ImpactTest.create({
					filePath: link.artifact_path || "",
					linkType: link.link_type,
				}),
			)
		} else {
			affectedFiles.push(
				ImpactFile.create({
					filePath: link.artifact_path || "",
					lineStart: link.artifact_line_start || 0,
					lineEnd: link.artifact_line_end || 0,
					linkType: link.link_type,
				}),
			)
		}
	}

	// Find cascading requirements (other requirements linked to the same files)
	const affectedPaths = new Set(links.map((l) => l.artifact_path).filter(Boolean))
	const allLinks = db.getAllLinks()
	const cascadingRequirements = [
		...new Set(
			allLinks
				.filter(
					(l) => l.artifact_path && affectedPaths.has(l.artifact_path) && l.requirement_id !== request.requirementId,
				)
				.map((l) => l.requirement_id),
		),
	]

	return ImpactAnalysisResponse.create({
		requirementId: request.requirementId,
		affectedFiles,
		affectedTests,
		cascadingRequirements,
	})
}
