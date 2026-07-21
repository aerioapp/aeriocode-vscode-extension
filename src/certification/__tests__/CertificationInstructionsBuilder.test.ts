import { expect } from "chai"
import { CertificationInstructionsBuilder } from "../CertificationInstructionsBuilder"
import type { CertificationProfile, RequirementRow } from "../types"

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
	},
	requirement_id_patterns: ["REQ-{type}-{number}", "HLR-{number}"],
	requirement_levels: ["system", "high_level"],
	traceability_directions: ["bidirectional"],
	safety_coding_rules: "power-of-10",
	coding_standards: ["MISRA-C-2012"],
}

const mockRequirements: RequirementRow[] = [
	{
		id: 1,
		requirement_id: "REQ-SYS-001",
		level: "system",
		title: "Input Validation",
		description: "Validate all user inputs",
		dal_level: "A",
		status: "active",
		parent_requirement_id: null,
		source: null,
		rationale: null,
		change_history: "[]",
		created_at: "2024-01-01",
		updated_at: "2024-01-01",
	},
]

describe("CertificationInstructionsBuilder", () => {
	describe("build", () => {
		it("returns empty string when no requirements", () => {
			const result = CertificationInstructionsBuilder.build(mockProfile, [])
			expect(result).to.equal("")
		})

		it("returns empty string when profile is null", () => {
			const result = CertificationInstructionsBuilder.build(null as any, mockRequirements)
			expect(result).to.equal("")
		})

		it("includes certification standard header", () => {
			const result = CertificationInstructionsBuilder.build(mockProfile, mockRequirements)
			expect(result).to.include("DO-178C")
			expect(result).to.include("CERTIFICATION MODE ACTIVE")
		})

		it("lists all requirements with IDs and titles", () => {
			const result = CertificationInstructionsBuilder.build(mockProfile, mockRequirements)
			expect(result).to.include("REQ-SYS-001")
			expect(result).to.include("Input Validation")
		})

		it("includes classification level when present", () => {
			const result = CertificationInstructionsBuilder.build(mockProfile, mockRequirements)
			expect(result).to.include("[A]")
		})

		it("includes tag format instructions from profile patterns", () => {
			const result = CertificationInstructionsBuilder.build(mockProfile, mockRequirements)
			expect(result).to.include("REQ-{type}-{number}")
			expect(result).to.include("HLR-{number}")
			expect(result).to.include("Supported tag formats")
		})

		it("includes safety coding rules", () => {
			const result = CertificationInstructionsBuilder.build(mockProfile, mockRequirements)
			expect(result).to.include("power-of-10")
		})

		it("includes coding standards", () => {
			const result = CertificationInstructionsBuilder.build(mockProfile, mockRequirements)
			expect(result).to.include("MISRA-C-2012")
		})

		it("includes level context generically", () => {
			const result = CertificationInstructionsBuilder.build(mockProfile, mockRequirements)
			expect(result).to.include("DAL A")
			expect(result).to.include("Catastrophic")
			expect(result).to.include("MC/DC")
		})

		it("works with non-DO-178C profiles", () => {
			const isoProfile: CertificationProfile = {
				standard: "ISO-26262",
				version: "2018",
				publisher: "ISO",
				levels: {
					ASIL_D: {
						label: "ASIL D",
						failure_condition: "Dangerous",
						coverage_metric: "MC/DC",
						statement_coverage: 100,
						decision_coverage: 100,
						mcdc_coverage: 100,
						verification_independence: true,
						required_artifacts: [],
					},
				},
				requirement_id_patterns: ["ISO-{number}"],
				requirement_levels: ["functional", "technical"],
				traceability_directions: ["bidirectional"],
			}
			const result = CertificationInstructionsBuilder.build(isoProfile, mockRequirements)
			expect(result).to.include("ISO-26262")
			expect(result).to.include("ISO-{number}")
			expect(result).to.include("ASIL D")
		})
	})
})
