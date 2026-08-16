import { expect } from "chai"
import type { DeviationRecord } from "@/services/evidence/EvidenceClient"
import { daysUntilExpiry, decidedMessage, decisionsFor, describeRecord, validateDecision } from "../DeviationReview"

/**
 * Reviewing a deviation.
 *
 * The properties worth pinning are about what a reviewer is *not* invited to do: approve a settled
 * record, approve one with nobody named, or approve their own. The last is the only independence rule
 * enforceable client-side, and it is the reason reviewing is a separate command from raising.
 */

const NOW = new Date("2026-06-01T00:00:00.000Z")
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

function record(overrides: Partial<DeviationRecord> = {}): DeviationRecord {
	return {
		deviationId: "dev_1",
		standard: "aerio-scs",
		ruleId: "ERR-8",
		scope: "finding",
		file: "m.rs",
		fingerprint: "a".repeat(64),
		rationale: "Frame parsing is validated by the upstream CRC check; a malformed frame cannot reach here.",
		status: "proposed",
		raisedBy: "6",
		raisedAt: "2026-05-01T00:00:00.000Z",
		approvedBy: null,
		approvedAt: null,
		expiresAt: null,
		decidedBy: null,
		decidedAt: null,
		decisionReason: null,
		sameAccount: false,
		...overrides,
	}
}

describe("which decisions are open", () => {
	it("offers approve and reject on a proposal", () => {
		expect(decisionsFor(record()).map((choice) => choice.decision)).to.deep.equal(["approved", "rejected"])
	})

	it("offers only revoke once approved", () => {
		// Re-approving an approved waiver is not a decision; withdrawing it is.
		expect(decisionsFor(record({ status: "approved" })).map((choice) => choice.decision)).to.deep.equal(["revoked"])
	})

	it("offers nothing on a settled record", () => {
		// ⚠️ An empty list rather than a disabled menu. A greyed-out option invites a click and then
		// explains why it did nothing.
		expect(decisionsFor(record({ status: "rejected" }))).to.deep.equal([])
		expect(decisionsFor(record({ status: "revoked" }))).to.deep.equal([])
	})

	it("says what revoking costs", () => {
		const revoke = decisionsFor(record({ status: "approved" }))[0]
		expect(revoke.detail).to.contain("fails the gate again")
	})
})

describe("validating a decision before it is sent", () => {
	it("refuses to approve without naming an authority", () => {
		const problems = validateDecision(record(), "approved", "")
		expect(problems.join(" ")).to.contain("requires the name of the authority")
	})

	it("refuses to let the raiser approve their own", () => {
		// The only independence rule enforceable from here. Whether the named person actually pressed
		// the button is not knowable client-side, and the server records that separately.
		const problems = validateDecision(record({ raisedBy: "6" }), "approved", "6")
		expect(problems.join(" ")).to.contain("somebody other than the person who raised it")
	})

	it("accepts a named authority who is somebody else", () => {
		expect(validateDecision(record(), "approved", "j.okafor@example.test")).to.deep.equal([])
	})

	it("refuses a decision the record's state does not allow", () => {
		expect(validateDecision(record({ status: "revoked" }), "approved", "j.okafor@example.test").join(" ")).to.contain(
			"cannot be approved",
		)
	})

	it("does not demand an approver to reject or revoke", () => {
		// Requiring an approving authority in order to *refuse* a waiver would be the wrong way round.
		expect(validateDecision(record(), "rejected", null)).to.deep.equal([])
		expect(validateDecision(record({ status: "approved" }), "revoked", null)).to.deep.equal([])
	})
})

describe("what a reviewer sees before opening anything", () => {
	it("names the rule and what it covers", () => {
		expect(describeRecord(record(), NOW).label).to.contain("ERR-8")
		expect(describeRecord(record({ scope: "file" }), NOW).label).to.contain("m.rs")
	})

	it("flags an approval entered by the raiser in the summary line", () => {
		// ⚠️ Not invalid — it may be the only account there is — but a reviewer scanning a list should
		// not have to open every record to find the ones nobody countersigned.
		const line = describeRecord(record({ status: "approved", approvedBy: "j.okafor@example.test", sameAccount: true }), NOW)
		expect(line.description).to.contain("entered by the raiser")
	})

	it("says when an approval names nobody", () => {
		const line = describeRecord(record({ status: "approved", approvedBy: null }), NOW)
		expect(line.description).to.contain("by nobody named")
	})

	it("shows an approaching expiry without needing a click", () => {
		const line = describeRecord(record({ status: "approved", approvedBy: "x", expiresAt: daysFromNow(9) }), NOW)
		expect(line.description).to.contain("expires in 9d")
	})

	it("distinguishes expired from expiring", () => {
		const line = describeRecord(record({ status: "approved", approvedBy: "x", expiresAt: daysFromNow(-1) }), NOW)
		expect(line.description).to.contain("expired")
	})

	it("puts the rationale where it can be read", () => {
		// It is the whole point of the record; a reviewer deciding without it is rubber-stamping.
		expect(describeRecord(record(), NOW).detail).to.contain("CRC check")
	})
})

describe("expiry arithmetic matches the backend", () => {
	it("rounds up, so hours left is a day rather than zero", () => {
		expect(daysUntilExpiry({ expiresAt: new Date(NOW.getTime() + 14 * 3_600_000).toISOString() }, NOW)).to.equal(1)
	})

	it("is null when the record never lapses", () => {
		expect(daysUntilExpiry({ expiresAt: null }, NOW)).to.equal(null)
	})

	it("is null rather than NaN for an unparseable date", () => {
		expect(daysUntilExpiry({ expiresAt: "whenever" }, NOW)).to.equal(null)
	})
})

describe("what the reviewer is told afterwards", () => {
	it("says an approved violation is still reported", () => {
		// ⚠️ The likeliest misunderstanding at this moment is that approving makes the finding go away.
		const message = decidedMessage(record(), "approved", "j.okafor@example.test")
		expect(message).to.contain("still reported")
		expect(message).to.contain("accepted rather than outstanding")
	})

	it("says a rejection leaves the record behind", () => {
		expect(decidedMessage(record(), "rejected", null)).to.contain("asked for and refused")
	})

	it("says a revocation takes effect on the next run", () => {
		expect(decidedMessage(record({ status: "approved" }), "revoked", null)).to.contain("fails the gate again")
	})
})
