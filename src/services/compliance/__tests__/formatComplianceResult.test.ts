import { describe, it } from "mocha"
import { expect } from "chai"
import { formatAnalyzeResult, formatAutofixResult } from "../formatComplianceResult"
import type { AnalyzeResult, AutofixResult, ComplianceFinding } from "../ComplianceClient"

/**
 * The model acts on this text directly, so the wording carries real weight. In
 * particular a run that found nothing must not read as "fully compliant" when most of
 * the standard was never evaluated.
 */

function finding(overrides: Partial<ComplianceFinding> = {}): ComplianceFinding {
	return {
		standard: "jf-avpp",
		ruleId: "189",
		severity: "shall not",
		mandatory: true,
		file: "a.cpp",
		line: 4,
		column: 2,
		endLine: 4,
		endColumn: 12,
		message: "`goto` is prohibited.",
		confidence: "high",
		fixable: null,
		rule: { summary: "Do not transfer control with goto.", rationale: null, exception: null, section: "4.24" },
		...overrides,
	}
}

function analyzeResult(overrides: Partial<AnalyzeResult> = {}): AnalyzeResult {
	return {
		standard: "jf-avpp",
		standardName: "JF-AV++",
		standardVersion: "2RDU00001 Rev C",
		findings: [],
		skipped: [],
		parseErrors: [],
		summary: {
			standard: "jf-avpp",
			filesAnalyzed: 1,
			totalFindings: 0,
			returnedFindings: 0,
			truncated: false,
			bySeverity: {},
			rulesViolated: 0,
			violatedRuleIds: [],
			mandatoryViolations: 0,
			mandatoryClean: true,
			coverage: {
				rulesInStandard: 231,
				rulesAutomated: 42,
				rulesManualReview: 187,
				rulesAbsentFromSource: 2,
				absentRuleIds: ["161", "172"],
			},
			score: 100,
			scoreDefinition: "Percentage of automatically-checked rules with no violation.",
		},
		...overrides,
	}
}

describe("formatAnalyzeResult", () => {
	it("always states coverage, so a clean run cannot be read as full conformance", () => {
		const text = formatAnalyzeResult(analyzeResult())

		// 42 + 187 = 229. The denominator is the rules the standard defines, not the 231
		// catalog entries, so the two figures account for the whole of it.
		expect(text).to.contain("42 of 229 rules are checked automatically")
		expect(text).to.contain("187 require human review and were NOT evaluated")
	})

	it("names the rules that were checked only in part, in the same sentence", () => {
		// This text is what the model reads and retells to the user. Left out, "42 of 229 checked
		// automatically" is what gets reported, while some of those 42 were checked only as far as
		// one file's syntax tree reaches — a caveat the backend knows and the retelling drops.
		const text = formatAnalyzeResult(
			analyzeResult({
				summary: {
					...analyzeResult().summary,
					coverage: { ...analyzeResult().summary.coverage, rulesPartiallyAutomated: 12 },
				},
			}),
		)

		expect(text).to.contain("12 are checked only in part")
		expect(text).to.contain("187 require human review and were NOT evaluated")
	})

	it("says nothing about partial coverage when the backend does not report it", () => {
		// An older backend sends no such field. Printing "0 checked only in part" would be a claim
		// nobody made, and the wrong one — it would read as "all 42 were checked in full".
		const text = formatAnalyzeResult(analyzeResult())

		expect(text).to.not.contain("in part")
	})

	it("does not raise gaps in the standard's own rule numbering", () => {
		// The catalog carries entries for rule numbers the source document never defines.
		// They are kept for auditability against the source, but surfacing them here reads
		// as a shortcoming in Aerio rather than in the standard.
		const text = formatAnalyzeResult(analyzeResult())

		expect(text).to.not.contain("absent")
		expect(text).to.not.contain("161")
		expect(text).to.not.contain("172")
		expect(text).to.not.contain("231")
	})

	it("tells the model when the finding list was truncated", () => {
		// The backend caps findings to bound the response. Without this line the model
		// would fix everything it can see and declare the file compliant.
		const text = formatAnalyzeResult(
			analyzeResult({
				findings: [finding()],
				summary: {
					...analyzeResult().summary,
					totalFindings: 192000,
					returnedFindings: 5000,
					truncated: true,
				},
			}),
		)

		expect(text).to.contain("only 5000 of 192000 findings are listed")
		expect(text).to.contain("run the check again")
	})

	it("says nothing about truncation when the report is complete", () => {
		expect(formatAnalyzeResult(analyzeResult())).to.not.contain("findings are listed below")
	})

	it("reports mandatory violations distinctly from advisory ones", () => {
		const text = formatAnalyzeResult(
			analyzeResult({
				findings: [finding()],
				summary: {
					...analyzeResult().summary,
					totalFindings: 1,
					mandatoryViolations: 1,
					mandatoryClean: false,
					rulesViolated: 1,
				},
			}),
		)

		expect(text).to.contain("1 MANDATORY violation(s) — these must be fixed.")
		expect(text).to.contain("189 (shall not) — line 4")
	})

	it("marks findings that rely on a heuristic", () => {
		const text = formatAnalyzeResult(
			analyzeResult({ findings: [finding({ ruleId: "205", confidence: "medium", message: "volatile used" })] }),
		)

		expect(text).to.contain("[confidence: medium]")
	})

	it("notes when a fix is available and at which tier", () => {
		const text = formatAnalyzeResult(analyzeResult({ findings: [finding({ ruleId: "150", fixable: "safe" })] }))

		expect(text).to.contain("[autofix: safe]")
	})

	it("reports skipped files rather than implying they passed", () => {
		const text = formatAnalyzeResult(analyzeResult({ skipped: [{ path: "a.py", reason: "unrecognized file extension" }] }))

		expect(text).to.contain("Not analyzed:")
		expect(text).to.contain("a.py: unrecognized file extension")
	})

	it("surfaces parse warnings", () => {
		const text = formatAnalyzeResult(
			analyzeResult({ parseErrors: [{ path: "a.cpp", reason: "results for this file may be incomplete" }] }),
		)

		expect(text).to.contain("Parse warnings")
	})

	it("qualifies a clean result to the rules actually checked", () => {
		const text = formatAnalyzeResult(analyzeResult())

		expect(text).to.contain("No violations found among the automatically-checked rules.")
	})

	it("groups findings by file", () => {
		const text = formatAnalyzeResult(
			analyzeResult({
				findings: [finding({ file: "a.cpp" }), finding({ file: "b.cpp", ruleId: "190" })],
			}),
		)

		expect(text).to.contain("a.cpp:")
		expect(text).to.contain("b.cpp:")
	})

	it("caps the rendered findings and says how many were withheld", () => {
		const many = Array.from({ length: 250 }, (_, index) => finding({ line: index + 1 }))
		const text = formatAnalyzeResult(analyzeResult({ findings: many }))

		expect(text).to.match(/and 50 more finding\(s\) not shown/)
	})
})

describe("formatAutofixResult", () => {
	function autofixResult(overrides: Partial<AutofixResult> = {}): AutofixResult {
		return {
			standard: "jf-avpp",
			standardName: "JF-AV++",
			tier: "safe",
			files: [
				{
					file: "a.cpp",
					changed: true,
					fixed: "fixed source",
					diff: "--- a/a.cpp\n+++ b/a.cpp\n@@ -1 +1 @@\n-0xff\n+0xFF\n",
					applied: [{ ruleId: "150", tier: "safe", line: 3, description: "Uppercase hex digits" }],
					skipped: [],
				},
			],
			summary: { filesChanged: 1, fixesApplied: 1, fixesSkipped: 0, findingsBefore: 4 },
			...overrides,
		}
	}

	it("includes the diff so the change can be reviewed", () => {
		const text = formatAutofixResult(autofixResult())

		expect(text).to.contain("```diff")
		expect(text).to.contain("+0xFF")
	})

	it("states plainly that nothing was written to disk", () => {
		const text = formatAutofixResult(autofixResult())

		expect(text).to.contain("has NOT been written to disk")
		expect(text).to.contain("write_to_file or replace_in_file")
	})

	it("explains when nothing could be fixed mechanically", () => {
		const text = formatAutofixResult(
			autofixResult({
				files: [{ file: "a.cpp", changed: false, fixed: "", diff: "", applied: [], skipped: [] }],
				summary: { filesChanged: 0, fixesApplied: 0, fixesSkipped: 0, findingsBefore: 3 },
			}),
		)

		expect(text).to.contain("Nothing was fixed mechanically")
	})

	it("lists skipped fixes with their reason", () => {
		const text = formatAutofixResult(
			autofixResult({
				files: [
					{
						file: "a.cpp",
						changed: false,
						fixed: "",
						diff: "",
						applied: [],
						skipped: [{ ruleId: "185", line: 9, reason: "no mechanical fix applies here" }],
					},
				],
			}),
		)

		expect(text).to.contain("skipped 185 at line 9 — no mechanical fix applies here")
	})

	it("does not prefix a rule id with another standard's namespace", () => {
		// ⚠️ Every finding was rendered `AV Rule ${ruleId}` — correct while JF-AV++ was the only pack,
		// and inherited by the four packs added since. An Aerio Safety Coding Standard finding reached
		// the model as "AV Rule CTRL-4", and a MISRA one as "AV Rule Rule 17.6": ids belonging to no
		// standard, in the text the compliance gate feeds straight into its repair turn.
		//
		// Found in a screenshot of the shipped panel, not by any test, because every fixture used a
		// bare JF-AV++ number where the wrong prefix reads as the right one. This one uses a rule id
		// carrying its own namespace, which is the case the old format could not express.
		const text = formatAnalyzeResult(
			analyzeResult({
				findings: [finding({ ruleId: "CTRL-4", severity: "mandatory", line: 12, endLine: 12 })],
			}),
		)

		expect(text).to.contain("CTRL-4 (mandatory) — line 12")
		expect(text).to.not.contain("AV ")
	})
})
