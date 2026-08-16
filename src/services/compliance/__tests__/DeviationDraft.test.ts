import { expect } from "chai"
import type { ComplianceFinding } from "../ComplianceClient"
import { buildDeviationRequest, MIN_RATIONALE_LENGTH, raisedMessage, scopeChoicesFor, validateDraft } from "../DeviationDraft"

/**
 * Turning a finding into a deviation the server will accept.
 *
 * The client's copy of these rules exists to save a round trip, not to enforce anything — the server
 * validates independently and wins. So what matters here is that the two **agree**: a client check
 * that is stricter blocks something the server would take, with no way for the user to tell it is
 * wrong, and one that is looser produces the rejected-on-submit form this exists to avoid.
 */

const NOW = new Date("2026-06-01T00:00:00.000Z")
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

const GOOD_RATIONALE = "Generated from the hardware register map; the layout is fixed by silicon, not by us."

function finding(overrides: Partial<ComplianceFinding> = {}): ComplianceFinding {
	return {
		standard: "aerio-scs",
		ruleId: "CTRL-1",
		severity: "mandatory",
		mandatory: true,
		file: "hal/regs.c",
		line: 4,
		column: 5,
		endLine: 4,
		endColumn: 9,
		message: "This uses goto.",
		confidence: "high",
		fixable: null,
		fingerprint: "a".repeat(64),
		rule: { summary: null, rationale: null, exception: null, section: null },
		...overrides,
	}
}

describe("choosing what a deviation covers", () => {
	it("offers the narrowest scope first", () => {
		// The order is the recommendation. The narrowest waiver that does the job is the one to take,
		// and a picker renders these top to bottom.
		const choices = scopeChoicesFor(finding())
		expect(choices.map((choice) => choice.scope)).to.deep.equal(["finding", "file", "rule"])
	})

	it("withholds the per-violation scope when the server gave no identity for the finding", () => {
		// ⚠️ Offering it and then having the server reject the submission is worse than not offering
		// it. A finding arrives without a fingerprint only from a backend older than this extension.
		const choices = scopeChoicesFor(finding({ fingerprint: undefined }))
		expect(choices.map((choice) => choice.scope)).to.deep.equal(["file", "rule"])
	})

	it("says what the project-wide scope costs", () => {
		const projectWide = scopeChoicesFor(finding()).find((choice) => choice.scope === "rule")!
		expect(projectWide.detail).to.contain("review date")
	})
})

describe("what a draft must carry", () => {
	it("rejects a rationale short enough to be a box-tick", () => {
		const problems = validateDraft({ finding: finding(), scope: "file", rationale: "legacy", now: NOW })
		expect(problems.join(" ")).to.contain(`at least ${MIN_RATIONALE_LENGTH} characters`)
	})

	it("requires a review date for a project-wide deviation", () => {
		const problems = validateDraft({ finding: finding(), scope: "rule", rationale: GOOD_RATIONALE, now: NOW })
		expect(problems.join(" ")).to.contain("review date")

		const withDate = validateDraft({
			finding: finding(),
			scope: "rule",
			rationale: GOOD_RATIONALE,
			expiresAt: daysFromNow(180),
			now: NOW,
		})
		expect(withDate).to.deep.equal([])
	})

	it("allows a narrow deviation to be permanent", () => {
		// "This register map is hardware-defined" does not need revisiting quarterly, and forcing a
		// date would train people to enter a far-future one — which looks like a decision and is not.
		expect(validateDraft({ finding: finding(), scope: "file", rationale: GOOD_RATIONALE, now: NOW })).to.deep.equal([])
	})

	it("rejects a review date that has already passed", () => {
		const problems = validateDraft({
			finding: finding(),
			scope: "file",
			rationale: GOOD_RATIONALE,
			expiresAt: daysFromNow(-1),
			now: NOW,
		})
		expect(problems.join(" ")).to.contain("in the past")
	})

	it("rejects a date that is not one", () => {
		const problems = validateDraft({
			finding: finding(),
			scope: "file",
			rationale: GOOD_RATIONALE,
			expiresAt: "next quarter",
			now: NOW,
		})
		expect(problems.join(" ")).to.contain("YYYY-MM-DD")
	})

	it("reports every problem at once", () => {
		// Someone filling in a form wants all of it, not one per submission.
		const problems = validateDraft({ finding: finding(), scope: "rule", rationale: "no", now: NOW })
		expect(problems).to.have.length(2)
	})
})

describe("building the request", () => {
	it("sends no deviation id", () => {
		// ⚠️ The id is a hash of what the deviation covers and the derivation is the server's. A second
		// implementation fails by producing a *duplicate record* rather than an error, so the client
		// must not have one.
		const request = buildDeviationRequest({ finding: finding(), scope: "file", rationale: GOOD_RATIONALE, now: NOW })
		expect(request).to.not.have.property("deviationId")
	})

	it("carries the fingerprint only for a per-violation deviation", () => {
		const perViolation = buildDeviationRequest({ finding: finding(), scope: "finding", rationale: GOOD_RATIONALE, now: NOW })
		const perFile = buildDeviationRequest({ finding: finding(), scope: "file", rationale: GOOD_RATIONALE, now: NOW })

		expect(perViolation.fingerprint).to.equal("a".repeat(64))
		expect(perFile.fingerprint).to.equal(null)
	})

	it("drops the file path from a project-wide deviation", () => {
		// A path on a project-wide record reads as a restriction the record does not carry.
		const request = buildDeviationRequest({
			finding: finding(),
			scope: "rule",
			rationale: GOOD_RATIONALE,
			expiresAt: daysFromNow(90),
			now: NOW,
		})
		expect(request.file).to.equal(null)
	})

	it("trims the rationale", () => {
		const request = buildDeviationRequest({
			finding: finding(),
			scope: "file",
			rationale: `   ${GOOD_RATIONALE}   `,
			now: NOW,
		})
		expect(request.rationale).to.equal(GOOD_RATIONALE)
	})

	it("throws rather than sending an invalid draft", () => {
		expect(() => buildDeviationRequest({ finding: finding(), scope: "rule", rationale: "no", now: NOW })).to.throw(
			/Cannot raise this deviation/,
		)
	})
})

describe("what the user is told", () => {
	it("says plainly that nothing is waived yet", () => {
		// ⚠️ The likeliest misunderstanding at this moment is that raising a deviation silences the
		// finding. A user who believes that will not chase the approval and will be surprised when the
		// build stays red.
		const request = buildDeviationRequest({ finding: finding(), scope: "file", rationale: GOOD_RATIONALE, now: NOW })
		const message = raisedMessage(request)

		expect(message).to.contain("proposed, not approved")
		expect(message).to.contain("still fails the gate")
		expect(message).to.contain("other than you")
	})

	it("names what was waived", () => {
		const request = buildDeviationRequest({ finding: finding(), scope: "file", rationale: GOOD_RATIONALE, now: NOW })
		expect(raisedMessage(request)).to.contain("hal/regs.c")
	})
})
