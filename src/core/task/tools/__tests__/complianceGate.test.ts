import { describe, it, beforeEach } from "mocha"
import { expect } from "chai"
import type { AnalyzeResult, ComplianceFile, ComplianceFinding } from "@/services/compliance/ComplianceClient"
import {
	MAX_REPAIR_ATTEMPTS,
	RepairLedger,
	runComplianceGate,
	type ComplianceGateHost,
	type GateOutcome,
} from "../complianceGate"

/**
 * The gate that turns "the model was told to follow the standard" into "the code was checked".
 *
 * What is worth pinning here is mostly what the gate refuses to do: claim a file is compliant,
 * claim a file was checked when the checker was down, repair forever, or take a successful write
 * down with it because the backend was unavailable.
 */

function finding(overrides: Partial<ComplianceFinding> = {}): ComplianceFinding {
	return {
		standard: "aerio-scs",
		ruleId: "CTRL-1",
		severity: "mandatory",
		mandatory: true,
		file: "a.c",
		line: 4,
		column: 5,
		endLine: 4,
		endColumn: 9,
		message: "This uses goto.",
		confidence: "high",
		fixable: null,
		rule: { summary: null, rationale: null, exception: null, section: null },
		...overrides,
	}
}

function analysis(findings: ComplianceFinding[], filesAnalyzed = 1): AnalyzeResult {
	return {
		findings,
		summary: {
			standard: "aerio-scs",
			filesAnalyzed,
			totalFindings: findings.length,
			returnedFindings: findings.length,
			truncated: false,
			bySeverity: {},
			rulesViolated: new Set(findings.map((f) => f.ruleId)).size,
			violatedRuleIds: [...new Set(findings.map((f) => f.ruleId))],
			mandatoryViolations: findings.filter((f) => f.mandatory).length,
			mandatoryClean: findings.every((f) => !f.mandatory),
			coverage: { rulesInStandard: 148, rulesAutomated: 135, rulesManualReview: 13 },
		},
	} as unknown as AnalyzeResult
}

class Host implements ComplianceGateHost {
	public results: GateOutcome[] = []
	public warnings: string[] = []
	public analyzed: ComplianceFile[][] = []

	// Explicit fields rather than constructor parameter properties: `npm run test:unit` strips
	// types instead of compiling them, and parameter properties are the one TypeScript feature
	// that needs emitted code.
	private profile: { standard: string; level?: string | null } | null
	private responder: (files: ComplianceFile[]) => Promise<AnalyzeResult>

	constructor(
		profile: { standard: string; level?: string | null } | null,
		responder: (files: ComplianceFile[]) => Promise<AnalyzeResult>,
	) {
		this.profile = profile
		this.responder = responder
	}

	getProfile() {
		return this.profile
	}
	async analyze(_standard: string, files: ComplianceFile[]) {
		this.analyzed.push(files)
		return this.responder(files)
	}
	recordGateResult(result: GateOutcome) {
		this.results.push(result)
	}
	warn(message: string) {
		this.warnings.push(message)
	}
}

const PROFILE = { standard: "aerio-scs", level: "A" }

describe("the compliance gate", () => {
	let ledger: RepairLedger

	beforeEach(() => {
		ledger = new RepairLedger()
	})

	describe("when there is no safety profile", () => {
		it("does nothing at all, silently", async () => {
			const host = new Host(null, async () => analysis([]))
			const { feedback, outcome } = await runComplianceGate("a.c", "int main(void){return 0;}", ledger, host)

			expect(feedback).to.equal("")
			expect(host.analyzed).to.have.length(0)
			expect(outcome.ran).to.equal(false)
			// Every write outside a safety session would otherwise carry a line saying nothing happened.
			expect(host.results).to.have.length(0)
		})
	})

	describe("when the file is clean", () => {
		it("says so without claiming conformance", async () => {
			const host = new Host(PROFILE, async () => analysis([]))
			const { feedback } = await runComplianceGate("a.c", "int f(void){return 0;}", ledger, host)

			expect(feedback).to.contain("no mandatory findings")
			// The model repeats this to the user, so the smaller statement is the one that has to
			// be in the text: one file, automatically checkable rules only.
			expect(feedback).to.contain("it is not conformance")
			expect(feedback.toLowerCase()).to.not.contain("is compliant")
			expect(feedback.toLowerCase()).to.not.contain("certified")
		})

		it("does not consume a repair attempt", async () => {
			const host = new Host(PROFILE, async () => analysis([]))
			const { outcome } = await runComplianceGate("a.c", "int f(void){return 0;}", ledger, host)
			expect(outcome.attempt).to.equal(0)
		})
	})

	describe("when the file has mandatory findings", () => {
		it("names the rule and the line, and asks for a fix", async () => {
			const host = new Host(PROFILE, async () => analysis([finding()]))
			const { feedback, outcome } = await runComplianceGate("a.c", "goto x;", ledger, host)

			expect(feedback).to.contain("CTRL-1")
			expect(feedback).to.contain("line 4")
			expect(feedback).to.contain("Fix these now")
			// ⚠️ The scope instruction, pinned because removing it looks like tightening prose.
			// Measured over 24 tasks per language: among files still failing after a repair, the
			// repair had introduced a *new* violation in 6 of 8 C cases and 5 of 10 C++ cases —
			// more often than the original finding survived the fix. `write_to_file` re-emits the
			// whole file, so an unscoped "fix these" invites regressing a rule already satisfied.
			//
			// ⚠️ Directing the repair to `replace_in_file` has now been reverted **twice**, and only the
			// second measurement is worth anything.
			//
			// The first said "the model used the edit tool zero times in 24 tasks per language" — taken
			// while `replace_in_file` was uncallable, because the prompt named it 27 times without ever
			// demonstrating the call and `ToolExecutor` answered `missing required parameter 'diff'`
			// every time. Zero was the only outcome available, whatever the gate asked for. That pin
			// was protecting a conclusion drawn from a broken tool.
			//
			// Re-asked with the tool callable, the example shipped, and the harness able to apply a
			// SEARCH block that drops blank lines: targeted edits 0 → **3 of 35** repair turns, while
			// the no-tool nudge went 4/24 → **16/24** and clean-within-one-repair fell 17/24 →
			// **11/24**. Both costs are far outside the ±3 floor, and the nudge count stayed at 16
			// after the blank-line matcher landed, so the round trips are the instruction's rather than
			// the instrument's.
			//
			// Writing a SEARCH block that matches is harder than re-emitting a forty-line file, and a
			// failed attempt costs the user a turn — the cost this gate exists to reduce. Pinned again,
			// now with a number that survives scrutiny.
			expect(feedback).to.contain("Change only what these findings require")
			expect(feedback).to.not.contain("replace_in_file")
			expect(feedback).to.contain(`attempt 1 of ${MAX_REPAIR_ATTEMPTS}`)
			expect(outcome.mandatoryViolations).to.equal(1)
			expect(outcome.ruleIds).to.deep.equal(["CTRL-1"])
		})

		it("states the finding without appending an imperative", async () => {
			// ⚠️ Two repair-message candidates were built, measured on a healthy run, and reverted. Both
			// are pinned here because both will look obviously right to the next reader.
			//
			// **The rule's `authoringAction` beside the finding** — what to write, not only what is
			// wrong — had the widest surface of anything this programme examined: 60% of observed C
			// violations, 30% of C++. Clean within one repair went 17/24 → 15/24, inside the ±3 floor.
			//
			// **Naming the rules the previous attempt cleared** — "your last attempt fixed LAYOUT-5,
			// that fix must survive this one" — targeted repair regression. Repairs introducing a
			// violation absent before: 8–10 of 35 turns, then 10 of 34. Flat.
			//
			// Together they are the third confirmation that C's failures are not the model lacking the
			// rule: it recites LAYOUT-5 perfectly and omits it anyway, retrieval was ruled out on that
			// same evidence, and an instruction delivered at the exact moment it is actionable changes
			// nothing. That is the argument for the gate rather than for better wording.
			const host = new Host(PROFILE, async () => analysis([finding()]))
			const { feedback } = await runComplianceGate("a.c", "goto x;", ledger, host)

			expect(feedback).to.contain("CTRL-1")
			expect(feedback).to.not.contain("To fix:")
			expect(feedback).to.not.contain("Your last attempt fixed")
		})

		it("never directs the repair to a particular tool", async () => {
			// ⚠️ Settled after three tests, and the third is the one that means something.
			//
			// The first two were global and reverted on "the model never used the edit tool" — but it
			// was *uncallable* the first time, and the second was C-only, where files are a median of 24
			// lines and a rewrite genuinely does affect most of the content, exactly as the base prompt
			// says. Neither could decide it.
			//
			// The third asked where the premise holds: C++, median 40 lines up to 80, repairs
			// regressing in 18 of 39 turns against C's 10 of 34. Directed above 30 lines:
			//
			//     targeted edits used                 0 → 6 of 37 turns
			//     repairs introducing a violation    18/39 → 16/37
			//     never emitted a file                2/24 → 5/24
			//     clean within the gate's three      17/24 → 13/24
			//
			// The instruction was followed and the benefit did not arrive. A SEARCH/REPLACE block cannot
			// change a line it does not mention, so regressions should have fallen — they did not, which
			// means the model regresses through the lines it *does* mention. The premise was wrong, not
			// the delivery.
			const host = new Host(PROFILE, async () => analysis([finding()]))
			const short = await runComplianceGate("a.c", "int a;\n".repeat(10), ledger, host)
			const long = await runComplianceGate("b.cpp", "int a;\n".repeat(60), new RepairLedger(), host)

			expect(short.feedback).to.not.contain("replace_in_file")
			expect(long.feedback).to.not.contain("replace_in_file")
		})

		it("reports advisory findings without demanding a repair turn for them", async () => {
			// Advisory rules are defaults a programme may set aside. Spending a turn on one costs
			// the user and buys nothing.
			const host = new Host(PROFILE, async () =>
				analysis([finding({ mandatory: false, severity: "advisory", ruleId: "LAYOUT-1" })]),
			)
			const { feedback, outcome } = await runComplianceGate("a.c", "x", ledger, host)

			expect(outcome.mandatoryViolations).to.equal(0)
			expect(feedback).to.contain("no mandatory findings")
		})

		it("stops asking after the attempt budget, and requires the deviation be stated", async () => {
			const host = new Host(PROFILE, async () => analysis([finding()]))
			const source = "goto x;"

			for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
				const { feedback } = await runComplianceGate("a.c", source, ledger, host)
				expect(feedback).to.contain("Fix these now")
			}

			// One past the budget: an unfixable finding must not cost a turn on every future write.
			const { feedback, outcome } = await runComplianceGate("a.c", source, ledger, host)
			expect(outcome.exhausted).to.equal(true)
			expect(feedback).to.contain("no further repair will be requested")
			expect(feedback).to.contain("Do not attempt another fix")
			// The finding does not disappear because we gave up on it.
			expect(feedback).to.contain("a silent one is not")
		})

		it("gives the budget back when the model materially rewrote the file", async () => {
			const host = new Host(PROFILE, async () => analysis([finding()]))

			await runComplianceGate("a.c", "int f(void){ goto x; }", ledger, host)
			await runComplianceGate("a.c", "int f(void){ goto x; }", ledger, host)
			const rewritten = await runComplianceGate("a.c", "int g(void){ while (1) { break; } goto x; }", ledger, host)

			// A different attempt, not a repetition of the same one.
			expect(rewritten.outcome.attempt).to.equal(1)
		})

		it("does not give the budget back for reformatting alone", async () => {
			// Re-indenting has not addressed the finding, and treating it as a fresh attempt would
			// make the budget unbounded in practice.
			const host = new Host(PROFILE, async () => analysis([finding()]))

			await runComplianceGate("a.c", "int f(void){ goto x; }", ledger, host)
			const reformatted = await runComplianceGate("a.c", "int f(void)\n{\n\tgoto x;\n}", ledger, host)

			expect(reformatted.outcome.attempt).to.equal(2)
		})
	})

	describe("when the gate cannot run", () => {
		it("tells the model the file was NOT checked rather than staying silent", async () => {
			// The one wrong inference available here is that silence meant clean.
			const host = new Host(PROFILE, async () => {
				throw new Error("backend unavailable")
			})
			const { feedback, outcome } = await runComplianceGate("a.c", "x", ledger, host)

			expect(feedback).to.contain("could NOT be checked")
			expect(feedback).to.contain("Do not treat this file as verified")
			expect(outcome.ran).to.equal(false)
			expect(outcome.skippedReason).to.contain("backend unavailable")
			expect(host.warnings).to.have.length(1)
		})

		it("never throws, because the write has already succeeded", async () => {
			const host = new Host(PROFILE, async () => {
				throw new Error("boom")
			})
			// Failing the turn because the checker was down would make the tool less usable without
			// making any code safer.
			const result = await runComplianceGate("a.c", "x", ledger, host)
			expect(result.outcome).to.be.an("object")
		})

		it("says nothing for a file the standard does not cover", async () => {
			// filesAnalyzed 0 means nothing looked at it. Reporting that as violation-free would be
			// a claim about a file that was skipped.
			const host = new Host(PROFILE, async () => analysis([], 0))
			const { feedback, outcome } = await runComplianceGate("notes.md", "# hi", ledger, host)

			expect(feedback).to.equal("")
			expect(outcome.skippedReason).to.equal("language-not-covered")
		})
	})

	describe("the audit trail", () => {
		it("records every outcome, including the ones that produced no feedback", async () => {
			// What makes this evidence: the trail shows AI-authored code was checked and what came
			// back, which is the substance of a source-code review record for the generated portion.
			const host = new Host(PROFILE, async () => analysis([finding()]))
			await runComplianceGate("a.c", "goto x;", ledger, host)

			expect(host.results).to.have.length(1)
			expect(host.results[0]).to.include({ path: "a.c", standard: "aerio-scs", ran: true, mandatoryViolations: 1 })
		})
	})
})
