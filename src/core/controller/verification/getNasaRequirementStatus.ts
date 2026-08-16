import { Controller } from ".."
import { StringRequest } from "@shared/proto/aeriocode/common"
import { NasaRequirementRow, NasaRequirementStatusResponse } from "@shared/proto/aeriocode/verification"
import { VerificationApiError, VerificationClient } from "@/services/verification/VerificationClient"
import { declaredEvidence } from "./declaredEvidence"

/**
 * NPR 7150.2D Appendix C requirement status for one software classification.
 *
 * ⚠️ Its distinctive value is `conditional`, and it is the reason this is not the NASA rendering of a
 * shared call. SWE-219 and SWE-220 are marked applicable at classes A-D, but their text applies them
 * to identified safety-critical software components — a determination Appendix C does not record. A
 * class A project whose software is not safety-critical owes neither. Reporting them as applicable
 * would tell such a project it owes 100% MC/DC; reporting them as not applicable would excuse a
 * project that does have safety-critical software. Both are wrong, so the condition is stated.
 */
export async function getNasaRequirementStatus(
	_controller: Controller,
	request: StringRequest,
): Promise<NasaRequirementStatusResponse> {
	const softwareClass = (request.value || "").trim()
	if (!softwareClass) {
		return NasaRequirementStatusResponse.create({
			error: "No software classification was given. NASA classifications are A to F.",
		})
	}

	try {
		const status = await VerificationClient.getInstance().nasaRequirements(softwareClass, declaredEvidence())

		return NasaRequirementStatusResponse.create({
			document: status.document,
			publisher: status.publisher,
			attribution: status.attribution,
			softwareClass: status.softwareClass,
			requirementsInMatrix: status.summary.requirementsInMatrix,
			applicableAtClass: status.summary.applicableAtClass,
			conditional: status.summary.conditional,
			withPartialEvidence: status.summary.withPartialEvidence,
			withNoEvidence: status.summary.withNoEvidence,
			outOfScopeForAerio: status.summary.outOfScopeForAerio,
			statement: status.summary.statement,
			rows: status.rows.map((row) =>
				NasaRequirementRow.create({
					id: row.id,
					section: row.section,
					applicable: row.applicable,
					status: row.status,
					contributes: row.contributes ?? "",
					condition: row.condition ?? "",
				}),
			),
			error: "",
		})
	} catch (error) {
		const message = error instanceof VerificationApiError ? error.message : ((error as Error)?.message ?? String(error))
		return NasaRequirementStatusResponse.create({ error: message })
	}
}
