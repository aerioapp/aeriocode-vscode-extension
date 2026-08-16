import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import {
	TraceabilityDirectionSummary,
	TraceabilityMatrixResponse,
	TraceabilityMatrixRow,
} from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"
import {
	isImplemented,
	isVerified,
	linksByRequirement,
	pathsOfType,
	summariseTraceability,
	testPaths,
} from "@/certification/traceabilityStatus"

/**
 * The traceability matrix, in both directions.
 *
 * DO-178C 11.21 requires the associations to be **bi-directional**, and until now this answered
 * only half of it. Every row carried `coverage_percent: reqLinks.length > 0 ? 100 : 0` — one link
 * of any kind, including a link to a document, reported the requirement as 100% covered. A
 * requirement with a design note attached and no implementing code read as complete, which is the
 * exact objective (Table A-4 objective 6, Table A-5 objective 5) the matrix exists to evidence.
 *
 * There is no percentage that means anything at requirement level: a requirement is implemented or
 * it is not, and it is verified or it is not. The two are reported separately because they are
 * separate obligations — a programme can have every requirement implemented and none of them
 * verified, and a single number would average that into something reassuring.
 */
export async function getTraceabilityMatrix(
	_controller: Controller,
	_request: EmptyRequest,
): Promise<TraceabilityMatrixResponse> {
	const certManager = CertificationManager.getInstance()
	const db = certManager.getProjectDb()
	if (!db) {
		return TraceabilityMatrixResponse.create({ rows: [] })
	}

	const requirements = db.getAllRequirements()
	const links = db.getAllLinks()

	// One grouping pass, then a lookup per requirement. This filtered the whole link table inside
	// the row map — O(requirements × links) on a table a real baseline fills with thousands of each,
	// re-run on every panel open.
	const grouped = linksByRequirement(links)
	const summary = summariseTraceability(requirements, links)

	const rows = requirements.map((requirement) => {
		const requirementLinks = grouped.get(requirement.requirement_id)
		const sourceFiles = pathsOfType(requirementLinks, "source_code")
		const testFiles = testPaths(requirementLinks)

		return TraceabilityMatrixRow.create({
			requirementId: requirement.requirement_id,
			requirementLevel: requirement.level,
			title: requirement.title,
			dalLevel: requirement.dal_level || "",
			status: requirement.status,
			linkedSourceFiles: sourceFiles,
			linkedTestFiles: testFiles,
			linkedDocuments: pathsOfType(requirementLinks, "document"),
			implemented: isImplemented(requirementLinks),
			verified: isVerified(requirementLinks),
		})
	})

	return TraceabilityMatrixResponse.create({
		rows,
		summary: TraceabilityDirectionSummary.create({
			...summary,
			statement:
				`${summary.implemented} of ${summary.requirements} requirements have implementing code and ` +
				`${summary.verified} have a linked test. Both directions are reported: a requirement with ` +
				`no code is listed here, and a tag naming a requirement that is not in the baseline is listed as orphaned. ` +
				`Source files carrying no tag at all are not reported as unintended functionality — untagged and ` +
				`unnecessary are not the same thing, and this data cannot tell them apart.`,
		}),
	})
}
