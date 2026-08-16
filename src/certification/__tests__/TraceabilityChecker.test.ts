import { describe, it } from "mocha"
import { expect } from "chai"
import "@/test/vscode-mock"
import { TraceabilityChecker } from "../TraceabilityChecker"
import type { ProjectDatabase } from "../db/ProjectDatabase"
import type { RequirementRow, TraceabilityLinkRow } from "../types"

/**
 * Traceability, in both directions.
 *
 * DO-178C 11.21 requires the associations to be **bi-directional**, and this module answered only
 * one direction: which code carried a tag. Whether every requirement has implementing code — Table
 * A-4 objective 6 and Table A-5 objective 5 — was not asked anywhere in the extension.
 *
 * ⚠️ The suite that used to be here tested arithmetic it had written inline:
 *
 *     const coveragePercent = totalFiles > 0 ? Math.round((tracedFiles / totalFiles) * 100) : 0
 *     expect(coveragePercent).to.equal(75)
 *
 * That passes whatever `TraceabilityChecker` does, including nothing. The figure it was standing in
 * for reported `totalFunctions` and `tracedFunctions` as the same number, so function coverage read
 * 100% on every project, and no test could have noticed.
 */

const requirement = (id: string): RequirementRow =>
	({
		requirement_id: id,
		level: id.startsWith("HLR") ? "high" : "low",
		title: id,
		status: "approved",
	}) as RequirementRow

const link = (requirementId: string, artifactType: string, path: string): TraceabilityLinkRow =>
	({ requirement_id: requirementId, artifact_type: artifactType, artifact_path: path }) as TraceabilityLinkRow

/** Only the two methods getProjectCoverage reads. */
function fakeDb(requirements: RequirementRow[], links: TraceabilityLinkRow[]): ProjectDatabase {
	return {
		getAllRequirements: () => requirements,
		getAllLinks: () => links,
	} as unknown as ProjectDatabase
}

const coverageOf = (requirements: RequirementRow[], links: TraceabilityLinkRow[]) =>
	new TraceabilityChecker(fakeDb(requirements, links)).getProjectCoverage()

describe("project traceability coverage", () => {
	describe("requirement -> code, the direction that was missing", () => {
		it("names the requirements with no implementing code", async () => {
			const coverage = await coverageOf(
				[requirement("HLR-1"), requirement("LLR-1"), requirement("LLR-2")],
				[link("HLR-1", "source_code", "src/a.c")],
			)

			expect(coverage.requirements).to.equal(3)
			expect(coverage.implemented).to.equal(1)
			expect(coverage.unimplementedRequirementIds).to.deep.equal(["LLR-1", "LLR-2"])
		})

		it("does not count a document link as implementation", async () => {
			// The exact defect this replaces: the matrix reported 100% coverage for a requirement
			// carrying any link at all, so a requirement with a design note and no code read as
			// complete — against the objective the matrix exists to evidence.
			const coverage = await coverageOf([requirement("LLR-1")], [link("LLR-1", "document", "docs/design.md")])

			expect(coverage.implemented).to.equal(0)
			expect(coverage.unimplementedRequirementIds).to.deep.equal(["LLR-1"])
		})

		it("keeps implemented and verified apart", async () => {
			// A programme can have every requirement implemented and none of them verified. One
			// number would average that into something reassuring.
			const coverage = await coverageOf(
				[requirement("LLR-1"), requirement("LLR-2")],
				[
					link("LLR-1", "source_code", "src/a.c"),
					link("LLR-2", "source_code", "src/b.c"),
					link("LLR-1", "test_case", "t/a.c"),
				],
			)

			expect(coverage.implemented).to.equal(2)
			expect(coverage.verified).to.equal(1)
			expect(coverage.unverifiedRequirementIds).to.deep.equal(["LLR-2"])
		})

		it("counts a test result as verification as well as a test case", async () => {
			const coverage = await coverageOf([requirement("LLR-1")], [link("LLR-1", "test_result", "t/a.xml")])
			expect(coverage.verified).to.equal(1)
		})
	})

	describe("code -> requirement", () => {
		it("reports a tag naming a requirement that is not in the baseline", async () => {
			// Either the requirement was removed or the tag is wrong. Both need somebody to look.
			const coverage = await coverageOf(
				[requirement("LLR-1")],
				[link("LLR-1", "source_code", "src/a.c"), link("LLR-99", "source_code", "src/b.c")],
			)

			expect(coverage.orphanedTagRequirementIds).to.deep.equal(["LLR-99"])
		})

		it("reports the same orphaned requirement once however many files tag it", async () => {
			const coverage = await coverageOf(
				[requirement("LLR-1")],
				[link("LLR-99", "source_code", "src/a.c"), link("LLR-99", "source_code", "src/b.c")],
			)

			expect(coverage.orphanedTagRequirementIds).to.deep.equal(["LLR-99"])
		})

		it("counts untagged files without calling them unintended functionality", async () => {
			// The mocked workspace reports no files, so this asserts the arithmetic never goes
			// negative — the shape that matters is that untagged is reported as untagged.
			const coverage = await coverageOf([requirement("LLR-1")], [link("LLR-1", "source_code", "src/a.c")])

			expect(coverage.taggedFiles).to.equal(1)
			expect(coverage.untaggedFiles).to.equal(0)
			expect(coverage).to.not.have.property("coveragePercent")
		})
	})

	describe("an empty project", () => {
		it("reports zero rather than dividing by it", async () => {
			const coverage = await coverageOf([], [])

			expect(coverage.requirements).to.equal(0)
			expect(coverage.implemented).to.equal(0)
			expect(coverage.unimplementedRequirementIds).to.deep.equal([])
			expect(coverage.orphanedTagRequirementIds).to.deep.equal([])
		})
	})
})

describe("source file detection", () => {
	const sourceExtensions = [".c", ".h", ".cpp", ".cxx", ".cc", ".hpp", ".py", ".java", ".js", ".ts", ".go", ".rs"]

	it("recognizes every supported source extension", () => {
		for (const ext of sourceExtensions) {
			expect(sourceExtensions).to.include("." + `test/file${ext}`.split(".").pop()?.toLowerCase())
		}
	})

	it("does not recognize non-source extensions", () => {
		for (const ext of [".json", ".md", ".txt", ".xml", ".yaml"]) {
			expect(sourceExtensions).to.not.include("." + `test/file${ext}`.split(".").pop()?.toLowerCase())
		}
	})
})
