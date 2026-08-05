import { expect } from "chai"
import { calculateEnforcement } from "../coverageEnforcement"
import type { CertificationProfile } from "../types"

/**
 * These tests import the production function. An earlier version of this file defined its
 * own copy of the enforcement logic, which meant it verified the copy and not the code
 * that ships — and the copy was wrong in the same way the original was, so a DAL A project
 * with zero tests reporting "Coverage meets DAL A requirements" passed every assertion
 * here. A test that restates the implementation cannot fail when the implementation is
 * wrong.
 */

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
	it("reports traceability complete when every requirement is linked", () => {
		const result = calculateEnforcement(mockProfile, "DAL_A", 10, 10)
		expect(result).to.not.be.null
		expect(result!.traceability_passed).to.be.true
		expect(result!.traceability_coverage).to.equal(100)
	})

	it("reports traceability incomplete when requirements are unlinked", () => {
		const result = calculateEnforcement(mockProfile, "DAL_A", 10, 5)
		expect(result).to.not.be.null
		expect(result!.traceability_passed).to.be.false
		expect(result!.traceability_coverage).to.equal(50)
	})

	it("returns null for unknown level", () => {
		expect(calculateEnforcement(mockProfile, "UNKNOWN", 10, 10)).to.be.null
	})

	it("does not treat a project with no requirements as fully traced", () => {
		const result = calculateEnforcement(mockProfile, "DAL_A", 0, 0)
		expect(result).to.not.be.null
		expect(result!.traceability_passed).to.be.false
		expect(result!.traceability_coverage).to.equal(0)
	})

	it("requires full traceability regardless of assurance level", () => {
		// DAL C is the least demanding level in this profile, and it still cannot reach a
		// traceability pass on partial links.
		const dalC = calculateEnforcement(mockProfile, "DAL_C", 10, 9)
		expect(dalC!.required_traceability_coverage).to.equal(100)
		expect(dalC!.traceability_passed).to.be.false
	})

	describe("structural coverage is never inferred from traceability", () => {
		it("reports structural coverage as unavailable even at 100% traceability", () => {
			const result = calculateEnforcement(mockProfile, "DAL_A", 10, 10)
			expect(result!.structural_coverage_available).to.be.false
			expect(result!.structural_coverage).to.be.null
		})

		it("names the metric the level requires without claiming to have measured it", () => {
			expect(calculateEnforcement(mockProfile, "DAL_A", 10, 10)!.required_structural_metric).to.equal("MC/DC")
			expect(calculateEnforcement(mockProfile, "DAL_C", 10, 10)!.required_structural_metric).to.equal("Statement")
		})

		it("says structural coverage was not measured, even when traceability passes", () => {
			// The regression guard. This message is what a user reads to decide whether the
			// level's objectives are met; it must never imply MC/DC was evaluated.
			const message = calculateEnforcement(mockProfile, "DAL_A", 10, 10)!.message
			expect(message).to.include("MC/DC")
			expect(message).to.include("has not been measured")
			expect(message).to.not.match(/coverage meets/i)
		})

		it("reports the shortfall and the unmeasured metric when traceability fails", () => {
			const message = calculateEnforcement(mockProfile, "DAL_A", 10, 5)!.message
			expect(message).to.include("DAL A")
			expect(message).to.include("Traceability incomplete")
			expect(message).to.include("has not been measured")
		})
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
		expect(result!.traceability_passed).to.be.false
		expect(result!.required_structural_metric).to.equal("Decision")
		expect(result!.message).to.include("ASIL B")
	})
})
