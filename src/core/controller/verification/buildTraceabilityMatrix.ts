import { Controller } from ".."
import {
	BuildTraceabilityMatrixRequest,
	BuildTraceabilityMatrixResponse,
	TraceabilityRow,
} from "@shared/proto/aeriocode/verification"
import { VerificationApiError, VerificationClient } from "@/services/verification/VerificationClient"
import { filesInScope } from "./_scope"

/**
 * Build the traceability matrix in both directions.
 *
 * Requirement → code answers "is everything implemented". Code → requirement answers "is every
 * piece of code required", which is the shape unintended functionality takes and the direction
 * almost nobody measures. Both counts come back, and the statement explaining that an untagged
 * file is *untagged* rather than unintended comes back with them — Aerio cannot tell code that
 * implements nothing from code nobody annotated, and the stronger claim would accuse a programme
 * of something the data does not show.
 */
export async function buildTraceabilityMatrix(
	_controller: Controller,
	request: BuildTraceabilityMatrixRequest,
): Promise<BuildTraceabilityMatrixResponse> {
	try {
		if (request.requirements.length === 0) {
			return BuildTraceabilityMatrixResponse.create({
				error: "Import a requirements baseline first — a matrix over no requirements would report full coverage of nothing.",
			})
		}

		const { files } = await filesInScope(request.scope)
		const matrix = await VerificationClient.getInstance().buildMatrix({
			requirements: request.requirements.map((requirement) => ({
				requirementId: requirement.requirementId,
				title: requirement.title || null,
				description: requirement.description || null,
				parentRequirementId: requirement.parentRequirementId || null,
				status: requirement.status || null,
			})),
			files,
			requirementIdPatterns: request.requirementIdPatterns.length > 0 ? request.requirementIdPatterns : null,
		})

		return BuildTraceabilityMatrixResponse.create({
			rows: matrix.rows.map((row) =>
				TraceabilityRow.create({
					requirementId: row.requirementId,
					title: row.title ?? "",
					implemented: row.implemented,
					verified: row.verified,
					isDerived: row.isDerived,
					codeReferences: row.code.length,
					qualityQuestions: row.quality.length,
				}),
			),
			requirements: matrix.counts.requirements,
			implemented: matrix.counts.implemented,
			verified: matrix.counts.verified,
			derived: matrix.counts.derived,
			orphanedTags: matrix.counts.orphanedTags,
			filesWithNoTag: matrix.counts.filesWithNoTag,
			reverseStatement: matrix.reverse.statement,
			derivedStatement: matrix.derivedRequirements.statement,
			limits: matrix.limits,
			error: "",
		})
	} catch (error) {
		const message = error instanceof VerificationApiError ? error.message : ((error as Error)?.message ?? String(error))
		return BuildTraceabilityMatrixResponse.create({ error: message })
	}
}
