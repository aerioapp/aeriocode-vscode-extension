import { Controller } from ".."
import {
	GeneratedTestCase,
	GenerateTestsRequest,
	GenerateTestsResponse,
	InstrumentedFile,
} from "@shared/proto/aeriocode/verification"
import { VerificationApiError, VerificationClient } from "@/services/verification/VerificationClient"

/**
 * Generate requirements-based test cases.
 *
 * Two refusals carry this feature and both survive the trip through here.
 *
 * **The expected result is never generated.** An expectation inferred from the implementation
 * verifies that the code does what it does and cannot fail, so it is left blank and the skeleton
 * is written not to compile until a person fills it in. The proto has no field for it, which is
 * the version of that refusal a future edit cannot undo by accident.
 *
 * **A generated case is not automatically requirements-based.** A boundary derived from `int32_t`
 * is derived from the type, so `basis` separates the populations and travels on every case.
 */
export async function generateRequirementsBasedTests(
	_controller: Controller,
	request: GenerateTestsRequest,
): Promise<GenerateTestsResponse> {
	try {
		if (request.requirements.length === 0) {
			return GenerateTestsResponse.create({
				error: "Import a requirements baseline first — there is nothing to derive cases from.",
			})
		}

		const result = await VerificationClient.getInstance().generateTests({
			requirements: request.requirements.map((requirement) => ({
				requirementId: requirement.requirementId,
				title: requirement.title || null,
				description: requirement.description || null,
			})),
			includeSkeletons: request.includeSkeletons,
		})

		return GenerateTestsResponse.create({
			cases: result.cases.map((testCase) =>
				GeneratedTestCase.create({
					testId: testCase.testId,
					requirementId: testCase.requirementId,
					name: testCase.name,
					basis: testCase.basis,
					rationale: testCase.rationale,
				}),
			),
			skeletons: (result.skeletons ?? []).map((file) =>
				InstrumentedFile.create({ path: file.path, content: file.content }),
			),
			basisStatement: result.basisStatement,
			limits: result.limits,
			error: "",
		})
	} catch (error) {
		const message = error instanceof VerificationApiError ? error.message : ((error as Error)?.message ?? String(error))
		return GenerateTestsResponse.create({ error: message })
	}
}
