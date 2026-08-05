import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { QualificationPositionResponse, ToolOperationalRequirement } from "@shared/proto/aeriocode/verification"
import { VerificationApiError, VerificationClient } from "@/services/verification/VerificationClient"

/**
 * Aerio's DO-330 qualification position.
 *
 * Needs no project data, because a customer asks this question before they have any: Criteria 3 at
 * TQL-5 — the tool supplements review and eliminates nothing, and every finding it produces is
 * reviewed by a person.
 *
 * `whyNotCriteria1` travels with it deliberately. Marketing autofix as *replacing* review would
 * argue Criteria 1, which at DAL A is TQL-1 — a qualification effort comparable to developing the
 * airborne software itself. Stating the alternative is what stops the stronger claim being made by
 * accident in a sales conversation.
 */
export async function getQualificationPosition(
	_controller: Controller,
	_request: EmptyRequest,
): Promise<QualificationPositionResponse> {
	try {
		const kit = await VerificationClient.getInstance().qualificationPosition()

		return QualificationPositionResponse.create({
			criteria: kit.position.criteria,
			tql: kit.position.tql,
			basis: kit.position.basis,
			whyNotCriteria1: kit.position.whyNotCriteria1,
			applicantObligation: kit.position.applicantObligation,
			requirements: kit.toolOperationalRequirements.map((requirement) =>
				ToolOperationalRequirement.create({
					id: requirement.id,
					title: requirement.title,
					requirement: requirement.requirement,
					rationale: requirement.rationale,
					verificationStatus: requirement.verification.status,
					casesRun: requirement.verification.casesRun,
					casesPassed: requirement.verification.casesPassed,
					casesFailed: requirement.verification.casesFailed,
					casesSkipped: requirement.verification.casesSkipped,
				}),
			),
			summaryStatement: kit.summary?.statement ?? "",
			error: "",
		})
	} catch (error) {
		const message = error instanceof VerificationApiError ? error.message : ((error as Error)?.message ?? String(error))
		return QualificationPositionResponse.create({ error: message })
	}
}
