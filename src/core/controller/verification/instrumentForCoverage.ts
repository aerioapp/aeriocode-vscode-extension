import { Controller } from ".."
import {
	InstrumentedFile,
	InstrumentForCoverageRequest,
	InstrumentForCoverageResponse,
} from "@shared/proto/aeriocode/verification"
import { VerificationApiError, VerificationClient } from "@/services/verification/VerificationClient"
import { filesInScope } from "./_scope"

/**
 * Instrument the selected source for structural coverage.
 *
 * Returns the instrumented copy and the freestanding runtime. It deliberately does **not** write
 * either to disk: instrumented source is a build artifact, and silently replacing a developer's
 * files with a rewritten copy is the one thing a tool aimed at certified software must never do.
 * The panel offers to save them where the user chooses.
 *
 * The coverage map stays on the server. Without it a trace is a stream of numbered probe calls,
 * which is what keeps the measurement Aerio's rather than something reproducible from the output.
 */
export async function instrumentForCoverage(
	_controller: Controller,
	request: InstrumentForCoverageRequest,
): Promise<InstrumentForCoverageResponse> {
	try {
		const { files } = await filesInScope(request.scope)
		if (files.length === 0) {
			return InstrumentForCoverageResponse.create({
				error: "No C or C++ files in that scope. Open a source file or widen the scope, then try again.",
			})
		}

		const result = await VerificationClient.getInstance().instrument(
			files,
			request.vectorsPerDecision > 0 ? request.vectorsPerDecision : undefined,
		)

		return InstrumentForCoverageResponse.create({
			buildId: result.buildId,
			files: result.files.map((file) => InstrumentedFile.create({ path: file.path, content: file.content })),
			runtime: result.runtime.map((file) => InstrumentedFile.create({ path: file.path, content: file.content })),
			statements: result.counts.statements,
			decisions: result.counts.decisions,
			conditions: result.counts.conditions,
			decisionsWithoutMcdc: result.counts.decisionsNotInstrumentedForMcdc,
			storageBytes: result.storage.total,
			integrationSteps: result.integration,
			note: result.note,
			error: "",
		})
	} catch (error) {
		const message = error instanceof VerificationApiError ? error.message : ((error as Error)?.message ?? String(error))
		return InstrumentForCoverageResponse.create({ error: message })
	}
}
