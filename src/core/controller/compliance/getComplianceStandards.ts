import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { ComplianceStandard, ComplianceStandardsResponse } from "@shared/proto/aeriocode/compliance"
import { ComplianceApiError, ComplianceClient } from "@/services/compliance/ComplianceClient"

/**
 * The compliance standards the backend has registered.
 *
 * Returned rather than hardcoded so a newly published rule pack appears in the picker
 * without an extension release. A failure comes back in `error` instead of throwing: the
 * panel needs to render "you are signed out" or "backend unreachable" as a message, not
 * as an empty list that looks like "no standards exist".
 */
export async function getComplianceStandards(
	_controller: Controller,
	_request: EmptyRequest,
): Promise<ComplianceStandardsResponse> {
	try {
		const standards = await ComplianceClient.getInstance().listStandards()

		return ComplianceStandardsResponse.create({
			standards: standards.map((standard) =>
				ComplianceStandard.create({
					id: standard.id,
					name: standard.name,
					title: standard.title,
					version: standard.version,
					languages: standard.languages,
					rulesTotal: standard.rules.total,
					rulesAutomated: standard.rules.automated,
					rulesManualReview: standard.rules.manualReview,
					rulesAbsentFromSource: standard.rules.absentFromSource,
					fixesSafe: standard.autofix.safe,
					fixesReview: standard.autofix.review,
				}),
			),
			error: "",
		})
	} catch (error) {
		const message = error instanceof ComplianceApiError ? error.message : ((error as Error)?.message ?? String(error))
		return ComplianceStandardsResponse.create({ standards: [], error: message })
	}
}
