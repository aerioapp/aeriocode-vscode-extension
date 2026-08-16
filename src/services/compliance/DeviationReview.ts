import type { DeviationRecord } from "@/services/evidence/EvidenceClient"

/**
 * Reviewing a deviation somebody raised: which decisions are open, and what a reviewer needs told
 * before making one.
 *
 * Pure and free of `vscode`, like {@link DeviationDraft} next door, so the rules a reviewer meets can
 * be tested without an editor.
 *
 * ## Why reviewing is a separate command from raising
 *
 * ⚠️ Not a layout choice. Approval must name an authority other than the raiser, and putting an
 * "approve" button in front of the person who just wrote the rationale is the shape of a rubber
 * stamp — the interface would be inviting exactly the thing the record exists to rule out. Keeping
 * them apart does not *enforce* independence (the server does what it can, and records the rest), but
 * it stops the tool from suggesting the wrong thing.
 */

/** A decision a reviewer can take, and what it means for a deviation in a given state. */
export type Decision = "approved" | "rejected" | "revoked"

export interface DecisionChoice {
	decision: Decision
	label: string
	detail: string
}

/**
 * The decisions that make sense for a record in its current state.
 *
 * ⚠️ Returns an empty list rather than a disabled menu for a record nothing can be done to. A picker
 * of greyed-out options invites a click and then explains why it did nothing; saying up front that
 * this record is settled is shorter and truer.
 *
 * `rejected` and `revoked` differ in what they say happened, and both are offered where both are
 * true: a proposal that was never accepted was *rejected*, and a waiver that was in force and is
 * being withdrawn was *revoked*. Collapsing them would lose the distinction an auditor reads the
 * trail for.
 */
export function decisionsFor(record: DeviationRecord): DecisionChoice[] {
	switch (record.status) {
		case "proposed":
			return [
				{
					decision: "approved",
					label: "Approve",
					detail: "The violation may stay. Names the authority accepting the risk.",
				},
				{
					decision: "rejected",
					label: "Reject",
					detail: "The violation must be fixed. The record stays, showing it was asked for and refused.",
				},
			]
		case "approved":
			return [
				{
					decision: "revoked",
					label: "Revoke",
					detail: "Withdraw the waiver now, without waiting for its review date. The finding fails the gate again.",
				},
			]
		// A rejected or revoked record is settled. Re-raising is how a programme asks again, and that
		// produces the same deviation id — so the history stays on one record rather than forking.
		default:
			return []
	}
}

/**
 * What a reviewer sees in the list, before opening anything.
 *
 * ⚠️ The expiry and the self-approval flag are in the summary line rather than behind a click,
 * because they are what a reviewer would otherwise have to know to ask for. A waiver approved from
 * the raiser's own account is not invalid — it may be the only account there is — but a reviewer
 * scanning a list should not have to open each record to find the ones nobody countersigned.
 */
export function describeRecord(
	record: DeviationRecord,
	now: Date = new Date(),
): { label: string; description: string; detail: string } {
	const scopeWord =
		record.scope === "finding"
			? "one violation"
			: record.scope === "file"
				? `${record.ruleId} in ${record.file}`
				: `${record.ruleId} project-wide`

	const notes: string[] = [record.status]
	if (record.status === "approved") {
		notes.push(record.approvedBy ? `by ${record.approvedBy}` : "by nobody named")
		if (record.sameAccount) {
			notes.push("entered by the raiser")
		}
	}

	const days = daysUntilExpiry(record, now)
	if (days !== null) {
		notes.push(days <= 0 ? "expired" : `expires in ${days}d`)
	}

	return {
		label: `${record.ruleId} — ${scopeWord}`,
		description: notes.join(" · "),
		detail: record.rationale,
	}
}

/** Days until the record lapses, or null when it never does. Rounded up, as the backend does. */
export function daysUntilExpiry(record: Pick<DeviationRecord, "expiresAt">, now: Date = new Date()): number | null {
	if (!record.expiresAt) {
		return null
	}
	const expiry = new Date(record.expiresAt)
	if (Number.isNaN(expiry.getTime())) {
		return null
	}
	return Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000)
}

/**
 * Everything wrong with a decision before it is sent.
 *
 * Mirrors what the server enforces, so a reviewer is told before the round trip rather than after.
 * The server remains the authority — see the note in `DeviationDraft`.
 */
export function validateDecision(record: DeviationRecord, decision: Decision, approvedBy: string | null): string[] {
	const problems: string[] = []

	if (!decisionsFor(record).some((choice) => choice.decision === decision)) {
		problems.push(`A ${record.status} deviation cannot be ${decision}.`)
	}

	if (decision === "approved") {
		const name = (approvedBy ?? "").trim()
		if (name === "") {
			problems.push("Approving requires the name of the authority accepting the risk.")
		} else if (record.raisedBy && name === record.raisedBy) {
			// ⚠️ The one independence rule that *can* be enforced from here. Whether the named person
			// actually made the decision is not knowable client-side, and the server records that
			// separately rather than pretending otherwise.
			problems.push("The approving authority must be somebody other than the person who raised it.")
		}
	}

	return problems
}

/** What to tell the reviewer once the decision lands. */
export function decidedMessage(record: DeviationRecord, decision: Decision, approvedBy: string | null): string {
	switch (decision) {
		case "approved":
			return (
				`${record.ruleId} approved${approvedBy ? ` by ${approvedBy}` : ""}. The violation is still reported and still ` +
				`appears in the conformance report — it is now recorded as accepted rather than outstanding.`
			)
		case "rejected":
			return `${record.ruleId} rejected. The finding stays mandatory and the record shows the waiver was asked for and refused.`
		default:
			return `${record.ruleId} revoked. The waiver is no longer in force and the finding fails the gate again from the next run.`
	}
}
