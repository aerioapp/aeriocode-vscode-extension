import { expect } from "chai"
import * as vscode from "vscode"
import type { ComplianceFinding } from "../ComplianceClient"
import { DIAGNOSTIC_SOURCE } from "../ComplianceDiagnostics"
import { deviationCandidates, findingForDiagnostic, raiseDeviationTitle, titlesFor } from "../DeviationCodeActions"

/**
 * The lightbulb that makes deviations discoverable.
 *
 * What is worth pinning is what the menu must *not* offer: a deviation on an advisory finding, a
 * duplicate entry for one violation, or an entry built from another provider's diagnostic. Each is a
 * way for the action to appear correct while meaning something different from what the user reads.
 */

function finding(overrides: Partial<ComplianceFinding> = {}): ComplianceFinding {
	return {
		standard: "aerio-scs",
		ruleId: "CTRL-1",
		severity: "mandatory",
		mandatory: true,
		file: "demo.cpp",
		line: 15,
		column: 1,
		endLine: 15,
		endColumn: 12,
		message: "This uses goto.",
		confidence: "high",
		fixable: null,
		fingerprint: "a".repeat(64),
		rule: { summary: null, rationale: null, exception: null, section: null },
		...overrides,
	} as ComplianceFinding
}

function diagnostic(overrides: { line?: number; code?: string; source?: string } = {}): vscode.Diagnostic {
	const line = overrides.line ?? 15
	// vscode.Range is 0-based; findings are 1-based.
	const d = new vscode.Diagnostic(
		new vscode.Range(line - 1, 0, line - 1, 12),
		"This uses goto.",
		vscode.DiagnosticSeverity.Error,
	)
	d.source = overrides.source ?? DIAGNOSTIC_SOURCE
	d.code = overrides.code ?? "CTRL-1"
	return d
}

describe("matching a diagnostic back to its finding", () => {
	it("matches on rule id and line together", () => {
		const findings = [finding({ ruleId: "CTRL-1", line: 15 }), finding({ ruleId: "MEM-3", line: 35 })]
		expect(findingForDiagnostic(diagnostic({ line: 35, code: "MEM-3" }), findings)?.ruleId).to.equal("MEM-3")
	})

	it("does not match a different line of the same rule", () => {
		// One file can hold several findings for one rule — four gotos is four CTRL-1 findings — so
		// matching on rule id alone would attach the deviation to the wrong violation.
		const findings = [finding({ ruleId: "CTRL-1", line: 15 })]
		expect(findingForDiagnostic(diagnostic({ line: 19, code: "CTRL-1" }), findings)).to.equal(null)
	})

	it("ignores diagnostics from other providers", () => {
		// The provider is registered for "*", so it is handed every squiggle in the file — a compiler
		// error on the same line as a finding must not produce a deviation action.
		const findings = [finding()]
		expect(findingForDiagnostic(diagnostic({ source: "gcc" }), findings)).to.equal(null)
	})

	it("returns null when nothing was published for the file", () => {
		expect(findingForDiagnostic(diagnostic(), [])).to.equal(null)
	})
})

describe("choosing which findings get a lightbulb", () => {
	it("offers mandatory findings", () => {
		const findings = [finding()]
		expect(deviationCandidates([diagnostic()], findings)).to.have.length(1)
	})

	it("never offers an advisory finding", () => {
		// Nothing to waive: an advisory does not fail a gate. A record against one would mean nothing,
		// and offering it teaches that deviations are how advisories get silenced.
		const findings = [finding({ mandatory: false, severity: "advisory" })]
		expect(deviationCandidates([diagnostic()], findings)).to.have.length(0)
	})

	it("never offers a finding an approved deviation already covers", () => {
		// Applying a deviation clears `mandatory`, so this falls out of the same test. Proposing the
		// decision again would read as though it had not been taken.
		const findings = [finding({ mandatory: false, deviated: true, mandatoryBeforeDeviation: true })]
		expect(deviationCandidates([diagnostic()], findings)).to.have.length(0)
	})

	it("offers one entry per violation when a diagnostic is presented twice", () => {
		const findings = [finding()]
		expect(deviationCandidates([diagnostic(), diagnostic()], findings)).to.have.length(1)
	})

	it("gives two entries on one line distinguishable titles", () => {
		// ⚠️ Regression. Both read "Raise a compliance deviation…" — identical strings offering a
		// choice with nothing to choose between. Caught by looking at the menu, not by a test.
		const titles = ["CTRL-1", "CTRL-14"].map(raiseDeviationTitle)
		expect(new Set(titles).size).to.equal(2)
		expect(titles[0]).to.contain("CTRL-1")
	})

	it("adds the line when one rule fires more than once in the menu", () => {
		// ⚠️ Third regression on the same defect, and the one the first two fixes did not reach. A label
		// and a `goto` are both CTRL-1, so leading with the rule id still produced two entries reading
		// "CTRL-1: raise a compliance deviation…". The line is the only thing left that separates them.
		const titles = titlesFor([finding({ ruleId: "CTRL-1", line: 13 }), finding({ ruleId: "CTRL-1", line: 15 })])
		expect(new Set(titles).size).to.equal(2)
		expect(titles[0]).to.contain("line 13")
		expect(titles[1]).to.contain("line 15")
	})

	it("omits the line when a rule appears once", () => {
		// The common case. Adding a line number nobody needs makes every entry longer and pushes the
		// rest of the title further into the truncation that started all of this.
		const titles = titlesFor([finding({ ruleId: "CTRL-1", line: 13 }), finding({ ruleId: "MEM-3", line: 35 })])
		expect(titles[0]).to.equal("CTRL-1: raise a compliance deviation…")
		expect(titles[1]).to.equal("MEM-3: raise a compliance deviation…")
	})

	it("keeps the rule id leading even when the line is added", () => {
		expect(
			titlesFor([finding({ ruleId: "CTRL-1", line: 13 }), finding({ ruleId: "CTRL-1", line: 15 })])[0].indexOf("CTRL-1"),
		).to.equal(0)
	})

	it("leads with the rule id so truncation cannot remove it", () => {
		// ⚠️ Second regression, and the reason the first fix changed nothing on screen. The lightbulb
		// menu is narrow and VS Code truncates to fit, so a rule id at the end was cut off and both
		// entries rendered identically again. Asserting the id survives a truncation to the width the
		// menu actually showed pins the property rather than the wording.
		const title = raiseDeviationTitle("CTRL-14")
		expect(title.indexOf("CTRL-14")).to.equal(0)
		expect(title.slice(0, 28)).to.contain("CTRL-14")
	})

	it("offers both when two rules fire on one line", () => {
		// Ordinary: a goto to a label at a function's last statement is CTRL-1 and CTRL-14 together.
		const findings = [
			finding({ ruleId: "CTRL-1", line: 24, fingerprint: "a".repeat(64) }),
			finding({ ruleId: "CTRL-14", line: 24, fingerprint: "b".repeat(64) }),
		]
		const actions = deviationCandidates(
			[diagnostic({ line: 24, code: "CTRL-1" }), diagnostic({ line: 24, code: "CTRL-14" })],
			findings,
		)
		expect(actions.map((f) => f.ruleId)).to.deep.equal(["CTRL-1", "CTRL-14"])
	})

	it("falls back to rule and line when a finding carries no fingerprint", () => {
		// A backend older than this extension does not send one; dedup must still work rather than
		// collapsing every unfingerprinted finding into a single entry.
		const findings = [
			finding({ ruleId: "CTRL-1", line: 15, fingerprint: undefined }),
			finding({ ruleId: "CTRL-1", line: 19, fingerprint: undefined }),
		]
		const actions = deviationCandidates([diagnostic({ line: 15 }), diagnostic({ line: 19 })], findings)
		expect(actions.map((f) => f.line)).to.deep.equal([15, 19])
	})
})
