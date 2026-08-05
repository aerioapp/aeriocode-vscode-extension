import { Controller } from ".."
import { ImportedRequirement, ImportRequirementsRequest, ImportRequirementsResponse } from "@shared/proto/aeriocode/verification"
import { VerificationApiError, VerificationClient } from "@/services/verification/VerificationClient"
import * as fs from "fs/promises"

/** 64 MB, matching the backend's own cap. Refused here so a huge file is not uploaded to be refused. */
const MAX_REQIF_BYTES = 64 * 1024 * 1024

/**
 * Import a ReqIF requirements baseline.
 *
 * ReqIF is the neutral format DOORS, Polarion, Jama and codebeamer all speak, and requirements
 * never originate in Aerio — so without this the traceability module cannot be used on a real
 * programme at all.
 *
 * A partial import is refused by the backend rather than accepted, and that refusal is passed
 * through unchanged: the gaps in a partly-imported baseline are invisible afterwards, and a matrix
 * built over one reports full coverage of the requirements it happens to know about.
 */
export async function importRequirements(
	_controller: Controller,
	request: ImportRequirementsRequest,
): Promise<ImportRequirementsResponse> {
	try {
		if (!request.filePath) {
			return ImportRequirementsResponse.create({ error: "No file was selected." })
		}

		const stat = await fs.stat(request.filePath)
		if (stat.size > MAX_REQIF_BYTES) {
			return ImportRequirementsResponse.create({
				error: `That file is ${Math.round(stat.size / (1024 * 1024))} MB; the limit is ${MAX_REQIF_BYTES / (1024 * 1024)} MB.`,
			})
		}

		const xml = await fs.readFile(request.filePath, "utf8")
		const result = await VerificationClient.getInstance().importReqIf(xml)

		return ImportRequirementsResponse.create({
			requirements: result.requirements.map((requirement) =>
				ImportedRequirement.create({
					requirementId: requirement.requirementId,
					title: requirement.title ?? "",
					description: requirement.description ?? "",
					parentRequirementId: requirement.parentRequirementId ?? "",
					status: requirement.status ?? "",
				}),
			),
			specObjects: result.counts.specObjects,
			imported: result.counts.imported,
			skipped: result.counts.skipped,
			withParent: result.counts.withParent,
			sourceDigest: result.sourceDigest,
			error: "",
		})
	} catch (error) {
		const message = error instanceof VerificationApiError ? error.message : ((error as Error)?.message ?? String(error))
		return ImportRequirementsResponse.create({ error: message })
	}
}
