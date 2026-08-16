import { Controller } from ".."
import { StringRequest } from "@shared/proto/aeriocode/common"
import { EcssOutputRow, EcssOutputStatusResponse } from "@shared/proto/aeriocode/verification"
import { VerificationApiError, VerificationClient } from "@/services/verification/VerificationClient"
import { declaredEvidence } from "./declaredEvidence"

/**
 * ECSS Annex R expected-output status for one software criticality category.
 *
 * ⚠️ Not the ECSS rendering of a shared "regime status" call. Annex R is a per-clause tailoring of
 * *expected outputs*, and its distinctive value is `Ytba` — some DRD information may be missing if
 * justified and agreed with the customer. That is neither an obligation nor a relaxation, and a
 * response shape shared with DO-178C or NASA would have had nowhere to put it.
 *
 * The category is taken from the request rather than resolved here, because the screen showing this
 * is also the screen that lets a programme ask what a different category would look like.
 */
export async function getEcssOutputStatus(_controller: Controller, request: StringRequest): Promise<EcssOutputStatusResponse> {
	const category = (request.value || "").trim()
	if (!category) {
		return EcssOutputStatusResponse.create({
			error: "No criticality category was given. ECSS categories are A, B, C and D.",
		})
	}

	try {
		const status = await VerificationClient.getInstance().ecssOutputs(category, declaredEvidence())

		return EcssOutputStatusResponse.create({
			document: status.document,
			publisher: status.publisher,
			attribution: status.attribution,
			category: status.category,
			outputsInStandard: status.summary.outputsInStandard,
			applicableAtCategory: status.summary.applicableAtCategory,
			toBeAgreed: status.summary.toBeAgreed,
			withPartialEvidence: status.summary.withPartialEvidence,
			withNoEvidence: status.summary.withNoEvidence,
			outOfScopeForAerio: status.summary.outOfScopeForAerio,
			statement: status.summary.statement,
			rows: status.rows.map((row) =>
				EcssOutputRow.create({
					id: row.id,
					output: row.output,
					force: row.force,
					status: row.status,
					contributes: row.contributes ?? "",
				}),
			),
			error: "",
		})
	} catch (error) {
		const message = error instanceof VerificationApiError ? error.message : ((error as Error)?.message ?? String(error))
		return EcssOutputStatusResponse.create({ error: message })
	}
}
