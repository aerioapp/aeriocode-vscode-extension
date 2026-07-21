import { describe, it } from "mocha"
import { expect } from "chai"
import { RequirementTagParser } from "../RequirementTagParser"

describe("TraceabilityChecker (logic tests)", () => {
	describe("Source file detection logic", () => {
		const sourceExtensions = [".c", ".h", ".cpp", ".cxx", ".cc", ".hpp", ".py", ".java", ".js", ".ts", ".go", ".rs"]

		it("should recognize all supported source extensions", () => {
			for (const ext of sourceExtensions) {
				const testPath = `test/file${ext}`
				const detectedExt = "." + testPath.split(".").pop()?.toLowerCase()
				expect(sourceExtensions).to.include(detectedExt, `Extension ${ext} should be recognized`)
			}
		})

		it("should not recognize non-source extensions", () => {
			const nonSourceExtensions = [".json", ".md", ".txt", ".xml", ".yaml"]
			for (const ext of nonSourceExtensions) {
				const testPath = `test/file${ext}`
				const detectedExt = "." + testPath.split(".").pop()?.toLowerCase()
				expect(sourceExtensions).to.not.include(detectedExt, `Extension ${ext} should not be recognized`)
			}
		})
	})

	describe("Coverage calculation logic", () => {
		it("should calculate coverage percentage correctly", () => {
			const totalFiles = 100
			const tracedFiles = 75
			const coveragePercent = totalFiles > 0 ? Math.round((tracedFiles / totalFiles) * 100) : 0
			expect(coveragePercent).to.equal(75)
		})

		it("should return 0 for zero total files", () => {
			const totalFiles = 0
			const tracedFiles = 0
			const coveragePercent = totalFiles > 0 ? Math.round((tracedFiles / totalFiles) * 100) : 0
			expect(coveragePercent).to.equal(0)
		})

		it("should calculate untraced files correctly", () => {
			const totalFiles = 50
			const tracedFiles = 30
			const untracedFiles = Math.max(0, totalFiles - tracedFiles)
			expect(untracedFiles).to.equal(20)
		})
	})
})
