import * as vscode from "vscode"
import { type DeviationRecord, EvidenceClient } from "@/services/evidence/EvidenceClient"
import { resolveComplianceProjectKey } from "./ComplianceAudit"
import { type Decision, decidedMessage, decisionsFor, describeRecord, validateDecision } from "./DeviationReview"

/**
 * The command behind "Aeriocode: Review Compliance Deviations".
 *
 * A thin shell over {@link DeviationReview}, in the same way the raise command is over
 * {@link DeviationDraft}: this file owns prompts and error surfaces and nothing else.
 *
 * ⚠️ **Deliberately a separate command from raising one.** Approval must name an authority other
 * than the raiser, and putting an approve button in front of the person who has just written the
 * rationale is the shape of a rubber stamp. Splitting them does not enforce independence — the
 * server enforces what it can and records the rest — but it stops the interface from proposing the
 * thing the record exists to rule out.
 */

export interface ReviewDeviationsDeps {
	client?: EvidenceClient
	projectKey?: string | null
	/** Injected so the expiry column is testable without waiting. */
	now?: Date
}

/**
 * List the project's deviations, take a decision on one.
 *
 * Returns the updated record, or null when the user cancelled or there was nothing to do. Never
 * throws: a cancelled pick and an unreachable backend both end with the user informed.
 */
export async function reviewDeviations(deps: ReviewDeviationsDeps = {}): Promise<Record<string, unknown> | null> {
	const projectKey = deps.projectKey !== undefined ? deps.projectKey : resolveComplianceProjectKey()
	if (!projectKey) {
		vscode.window.showWarningMessage(
			"Deviations are recorded against a certification project, and this workspace does not have one. " +
				"Turn on certification for this project first.",
		)
		return null
	}

	const client = deps.client ?? EvidenceClient.getInstance()
	const now = deps.now ?? new Date()

	let records: DeviationRecord[]
	try {
		records = (await client.listDeviations(projectKey)) as DeviationRecord[]
	} catch (error) {
		vscode.window.showErrorMessage(`Could not read the deviations: ${error instanceof Error ? error.message : String(error)}`)
		return null
	}

	if (!Array.isArray(records) || records.length === 0) {
		vscode.window.showInformationMessage("This project has no deviations.")
		return null
	}

	const record = await pickRecord(records, now)
	if (!record) {
		return null
	}

	const choices = decisionsFor(record)
	if (choices.length === 0) {
		// Settled. Saying so is more use than an empty picker — re-raising is how a programme asks
		// again, and that lands on this same record rather than forking the history.
		vscode.window.showInformationMessage(
			`${record.ruleId} is ${record.status} and settled. Raising the same deviation again reopens it on this record.`,
		)
		return null
	}

	const decision = await pickDecision(choices)
	if (!decision) {
		return null
	}

	const approvedBy = decision === "approved" ? await askAuthority(record) : null
	if (decision === "approved" && !approvedBy) {
		return null
	}

	const reason = decision === "approved" ? null : await askReason(decision)
	if (reason === undefined) {
		return null
	}

	const problems = validateDecision(record, decision, approvedBy)
	if (problems.length > 0) {
		vscode.window.showErrorMessage(problems.join(" "))
		return null
	}

	try {
		const updated = await client.decideDeviation(projectKey, record.deviationId, decision, {
			...(approvedBy ? { approvedBy } : {}),
			...(reason ? { reason } : {}),
		})
		vscode.window.showInformationMessage(decidedMessage(record, decision, approvedBy))
		return updated as Record<string, unknown>
	} catch (error) {
		vscode.window.showErrorMessage(`Could not record the decision: ${error instanceof Error ? error.message : String(error)}`)
		return null
	}
}

async function pickRecord(records: DeviationRecord[], now: Date): Promise<DeviationRecord | null> {
	// Proposals first: they are the ones waiting on somebody, and a list sorted by date buries them
	// under every settled record the project has accumulated.
	const ordered = [...records].sort((left, right) => rank(left) - rank(right))

	const items = ordered.map((record) => ({ ...describeRecord(record, now), record }))
	const choice = await vscode.window.showQuickPick(items, {
		placeHolder: "Which deviation?",
		matchOnDescription: true,
		matchOnDetail: true,
	})
	return choice?.record ?? null
}

/** Proposed before approved before everything settled. */
function rank(record: DeviationRecord): number {
	if (record.status === "proposed") {
		return 0
	}
	return record.status === "approved" ? 1 : 2
}

async function pickDecision(choices: ReturnType<typeof decisionsFor>): Promise<Decision | null> {
	const choice = await vscode.window.showQuickPick(
		choices.map((entry) => ({ label: entry.label, detail: entry.detail, decision: entry.decision })),
		{ placeHolder: "What is the decision?", matchOnDetail: true },
	)
	return choice?.decision ?? null
}

async function askAuthority(record: DeviationRecord): Promise<string | null> {
	const answer = await vscode.window.showInputBox({
		prompt: "Who is accepting this risk? Name the project manager or technical approval authority.",
		placeHolder: "j.okafor@example.com",
		validateInput: (value) => {
			const problems = validateDecision(record, "approved", value)
			return problems.length > 0 ? problems[0] : null
		},
	})
	return answer?.trim() || null
}

/** Returns `undefined` for cancelled and `null` for "no reason given", which are different outcomes. */
async function askReason(decision: Decision): Promise<string | null | undefined> {
	const answer = await vscode.window.showInputBox({
		prompt:
			decision === "rejected"
				? "Why is this being rejected? Optional, but it is what the raiser will act on."
				: "Why is this being revoked? Optional, but it explains a waiver disappearing.",
		placeHolder: "e.g. the CRC check this relied on was removed",
	})
	if (answer === undefined) {
		return undefined
	}
	return answer.trim() || null
}
