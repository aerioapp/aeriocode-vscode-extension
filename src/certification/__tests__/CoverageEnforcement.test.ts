import { expect } from "chai"
import type { CertificationProfile } from "../types"

// Test the enforcement logic directly (extracted for testability)
function calculateEnforcement(profile: CertificationProfile, profileLevel: string, totalReqs: number, tracedCount: number) {
	const levelConfig = profile.levels[profileLevel]
	if (!levelConfig) return null
	const coveragePercent = totalReqs > 0 ? Math.round((tracedCount / totalReqs) * 100) : 0
	const requiredCoverage = levelConfig.statement_coverage
	const passed = coveragePercent >= requiredCoverage
	return {
		requirements_met: tracedCount,
		requirements_total: totalReqs,
		passed,
		level_id: profileLevel,
		required_coverage: requiredCoverage,
		actual_coverage: coveragePercent,
		coverage_metric: levelConfig.coverage_metric || "requirements-based",
		message: passed
			? `Coverage meets ${levelConfig.label} requirements (${coveragePercent}% >= ${requiredCoverage}%)`
			: `Coverage below ${levelConfig.label} requirements (${coveragePercent}% < ${requiredCoverage}%)`,
	}
}

const mockProfile: CertificationProfile = {
	standard: "DO-178C",
	version: "C",
	publisher: "RTCA/EUROCAE",
	levels: {
		DAL_A: {
			label: "DAL A",
			failure_condition: "Catastrophic",
			coverage_metric: "MC/DC",
			statement_coverage: 100,
			decision_coverage: 100,
			mcdc_coverage: 100,
			verification_independence: true,
			required_artifacts: [],
		},
		DAL_C: {
			label: "DAL C",
			failure_condition: "Major",
			coverage_metric: "Statement",
			statement_coverage: 100,
			decision_coverage: 0,
			mcdc_coverage: 0,
			verification_independence: false,
			required_artifacts: [],
		},
	},
	requirement_id_patterns: [],
	requirement_levels: [],
	traceability_directions: [],
}

describe("CoverageEnforcement", () => {
	it("passes when coverage meets level requirement", () => {
		const result = calculateEnforcement(mockProfile, "DAL_A", 10, 10)
		expect(result).to.not.be.null
		expect(result!.passed).to.be.true
		expect(result!.actual_coverage).to.equal(100)
	})

	it("fails when coverage is below level requirement", () => {
		const result = calculateEnforcement(mockProfile, "DAL_A", 10, 5)
		expect(result).to.not.be.null
		expect(result!.passed).to.be.false
		expect(result!.actual_coverage).to.equal(50)
	})

	it("returns null for unknown level", () => {
		const result = calculateEnforcement(mockProfile, "UNKNOWN", 10, 10)
		expect(result).to.be.null
	})

	it("handles zero requirements", () => {
		const result = calculateEnforcement(mockProfile, "DAL_A", 0, 0)
		expect(result).to.not.be.null
		expect(result!.passed).to.be.false
		expect(result!.actual_coverage).to.equal(0)
	})

	it("includes correct message on pass", () => {
		const result = calculateEnforcement(mockProfile, "DAL_A", 10, 10)
		expect(result!.message).to.include("meets")
		expect(result!.message).to.include("DAL A")
	})

	it("includes correct message on fail", () => {
		const result = calculateEnforcement(mockProfile, "DAL_A", 10, 5)
		expect(result!.message).to.include("below")
		expect(result!.message).to.include("DAL A")
	})

	it("includes coverage_metric from level config", () => {
		const result = calculateEnforcement(mockProfile, "DAL_A", 10, 10)
		expect(result!.coverage_metric).to.equal("MC/DC")
	})

	it("works with non-DO-178C profiles", () => {
		const isoProfile: CertificationProfile = {
			standard: "ISO-26262",
			version: "2018",
			publisher: "ISO",
			levels: {
				ASIL_B: {
					label: "ASIL B",
					failure_condition: "Significant",
					coverage_metric: "Decision",
					statement_coverage: 100,
					decision_coverage: 100,
					mcdc_coverage: 0,
					verification_independence: false,
					required_artifacts: [],
				},
			},
			requirement_id_patterns: [],
			requirement_levels: [],
			traceability_directions: [],
		}
		const result = calculateEnforcement(isoProfile, "ASIL_B", 10, 8)
		expect(result).to.not.be.null
		expect(result!.passed).to.be.false
		expect(result!.coverage_metric).to.equal("Decision")
		expect(result!.message).to.include("ASIL B")
	})
})
