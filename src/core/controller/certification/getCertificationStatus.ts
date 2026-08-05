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
	traceabilityCoveragePercent: 0,
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
				levelId: status.enforcement.level_id || "",
				message: status.enforcement.message,

				traceabilityPassed: status.enforcement.traceability_passed,
				requiredTraceabilityCoverage: status.enforcement.required_traceability_coverage,
				traceabilityCoverage: status.enforcement.traceability_coverage,

				requiredStructuralMetric: status.enforcement.required_structural_metric,
				structuralCoverageAvailable: status.enforcement.structural_coverage_available,
				// proto3 has no null; the value is only meaningful when the flag above is set.
				structuralCoverage: status.enforcement.structural_coverage ?? 0,
			})
		}

		return CertificationStatusResponse.create({
			active: status.active,
			profileStandard: status.profile?.standard || "",
			profileLevel: status.profile_level || "",
			tracedCount: status.traced_count,
			untracedCount: status.untraced_count,
			traceabilityCoveragePercent: status.traceability_coverage_percent,
			lastAuditEntry: status.last_audit_entry || "",
			integrityStatus: status.integrity_status,
			enforcement,
		})
	} catch {
		return INACTIVE_RESPONSE
	}
}
