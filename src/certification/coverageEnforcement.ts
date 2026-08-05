import type { CertificationProfile, CoverageEnforcement } from "./types"

/**
 * Traceability is required in full at every assurance level — a requirement with no link
 * to an artifact is an unimplemented or unverified requirement regardless of DAL.
 */
const REQUIRED_TRACEABILITY_COVERAGE = 100

/**
 * Evaluate a project against its assurance level.
 *
 * Two distinct objectives, kept apart on purpose:
 *
 *   Traceability coverage — how much of the requirement set is linked to artifacts.
 *                           Computed here, from data the project database holds.
 *   Structural coverage   — how much of the code the requirements-based tests exercised.
 *                           MC/DC at DAL A, decision at DAL B, statement at DAL C.
 *                           Nothing measures this yet, so it is reported as unavailable.
 *
 * These are not substitutes for one another, and the failure this function exists to
 * prevent is treating them as if they were. A previous version compared traceability
 * coverage against `levelConfig.statement_coverage`, then labelled the result with the
 * level's structural metric — so a DAL A project with every requirement linked and no
 * tests at all was told "Coverage meets DAL A requirements", metric "MC/DC".
 *
 * There is deliberately no aggregate `passed`. A caller that wants one has to decide what
 * to do about a metric that was never measured, rather than inheriting an answer that
 * quietly ignored it.
 */
export function calculateEnforcement(
	profile: CertificationProfile,
	profileLevel: string,
	totalReqs: number,
	tracedCount: number,
): CoverageEnforcement | null {
	const levelConfig = profile.levels[profileLevel]
	if (!levelConfig) {
		return null
	}

	const traceabilityCoverage = totalReqs > 0 ? Math.round((tracedCount / totalReqs) * 100) : 0
	const traceabilityPassed = traceabilityCoverage >= REQUIRED_TRACEABILITY_COVERAGE
	const requiredStructuralMetric = levelConfig.coverage_metric || "requirements-based testing"

	return {
		requirements_met: tracedCount,
		requirements_total: totalReqs,
		level_id: profileLevel,

		traceability_passed: traceabilityPassed,
		required_traceability_coverage: REQUIRED_TRACEABILITY_COVERAGE,
		traceability_coverage: traceabilityCoverage,

		required_structural_metric: requiredStructuralMetric,
		structural_coverage_available: false,
		structural_coverage: null,

		// States what was measured and what was not. A reader must not come away believing
		// the level's structural objective has been satisfied.
		message: traceabilityPassed
			? `Traceability complete for ${levelConfig.label} (${traceabilityCoverage}% of requirements linked). ` +
				`${requiredStructuralMetric} coverage is required at this level and has not been measured.`
			: `Traceability incomplete for ${levelConfig.label} (${traceabilityCoverage}% of ${totalReqs} requirements linked, ` +
				`${REQUIRED_TRACEABILITY_COVERAGE}% required). ${requiredStructuralMetric} coverage is also required at this ` +
				`level and has not been measured.`,
	}
}

export { REQUIRED_TRACEABILITY_COVERAGE }
