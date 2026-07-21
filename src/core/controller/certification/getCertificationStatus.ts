import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { CertificationStatusResponse, CoverageEnforcement } from "@shared/proto/aeriocode/certification"
import { CertificationManager } from "@/certification"

const INACTIVE_RESPONSE = CertificationStatusResponse.create({
	active: false,
	profileStandard: "",
	profileLevel: "",
	tracedCount: 0,
	untracedCount: 0,
	coveragePercent: 0,
	lastAuditEntry: "",
	integrityStatus: "unchecked",
	enforcement: undefined,
})

export async function getCertificationStatus(
	_controller: Controller,
	_request: EmptyRequest,
): Promise<CertificationStatusResponse> {
	try {
		const certManager = CertificationManager.getInstance()
		const status = certManager.getStatus()

		let enforcement: CoverageEnforcement | undefined
		if (status.enforcement) {
			enforcement = CoverageEnforcement.create({
				requirementsMet: status.enforcement.requirements_met,
				requirementsTotal: status.enforcement.requirements_total,
				passed: status.enforcement.passed,
				levelId: status.enforcement.level_id || "",
				requiredCoverage: status.enforcement.required_coverage,
				actualCoverage: status.enforcement.actual_coverage,
				coverageMetric: status.enforcement.coverage_metric,
				message: status.enforcement.message,
			})
		}

		return CertificationStatusResponse.create({
			active: status.active,
			profileStandard: status.profile?.standard || "",
			profileLevel: status.profile_level || "",
			tracedCount: status.traced_count,
			untracedCount: status.untraced_count,
			coveragePercent: status.coverage_percent,
			lastAuditEntry: status.last_audit_entry || "",
			integrityStatus: status.integrity_status,
			enforcement,
		})
	} catch {
		return INACTIVE_RESPONSE
	}
}
