import { Controller } from ".."
import {
	AnalyzeCoverageRequest,
	AnalyzeCoverageResponse,
	McdcFigure,
	UncoveredStatement,
} from "@shared/proto/aeriocode/verification"
import {
	VerificationApiError,
	VerificationClient,
	type McdcFigure as McdcFigureData,
} from "@/services/verification/VerificationClient"

/** Both forms travel to the panel. Neither is chosen for the applicant; see the backend module. */
function figure(data: McdcFigureData): McdcFigure {
	return McdcFigure.create({
		form: data.form,
		total: data.total,
		satisfied: data.satisfied,
		notDeterminable: data.notDeterminable,
		percentage: data.percentage ?? 0,
		conditionsTotal: data.conditionsTotal,
		conditionsSatisfied: data.conditionsSatisfied,
	})
}

/**
 * Interpret a trace the instrumented build emitted.
 *
 * `requirementsBasedStated` distinguishes "the user said no" from "the user did not say", which
 * are different claims: DO-178C 6.4.4.2 requires coverage to be achieved by requirements-based
 * tests, and a result that quietly assumed it was would be asserting the applicant's position for
 * them. A protobuf bool cannot carry the third state, so the flag rides alongside it.
 */
export async function analyzeCoverage(
	_controller: Controller,
	request: AnalyzeCoverageRequest,
): Promise<AnalyzeCoverageResponse> {
	try {
		if (!request.buildId || !request.traceBase64) {
			return AnalyzeCoverageResponse.create({ error: "A build id and a trace are both required." })
		}

		const result = await VerificationClient.getInstance().analyseCoverage(request.buildId, request.traceBase64, {
			requirementsBasedOnly: request.requirementsBasedStated ? request.requirementsBasedOnly : null,
		})

		return AnalyzeCoverageResponse.create({
			buildId: result.buildId,
			statementsTotal: result.statement.total,
			statementsCovered: result.statement.covered,
			statementPercentage: result.statement.percentage ?? 0,
			decisionsTotal: result.decision.total,
			decisionsSatisfied: result.decision.satisfied,
			decisionsNotDeterminable: result.decision.notDeterminable,
			decisionPercentage: result.decision.percentage ?? 0,
			mcdcUniqueCause: figure(result.mcdc.uniqueCause),
			mcdcMasking: figure(result.mcdc.masking),
			// Capped: a run over a whole codebase can leave thousands uncovered, and a panel showing
			// the first two hundred with a count is more usable than one that has to paginate before
			// it renders anything.
			uncovered: result.statement.uncovered
				.slice(0, 200)
				.map((entry) =>
					UncoveredStatement.create({ id: entry.id, file: entry.file, line: entry.line, text: entry.text }),
				),
			methodStatement: result.method.statement,
			testBasisStatement: result.testBasis.statement,
			limits: result.limits,
			error: "",
		})
	} catch (error) {
		const message = error instanceof VerificationApiError ? error.message : ((error as Error)?.message ?? String(error))
		return AnalyzeCoverageResponse.create({ error: message })
	}
}
