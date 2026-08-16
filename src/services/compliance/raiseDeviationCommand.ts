import * as vscode from "vscode"
import { EvidenceClient } from "@/services/evidence/EvidenceClient"
import { resolveComplianceProjectKey } from "./ComplianceAudit"
import type { ComplianceFinding } from "./ComplianceClient"
import { buildDeviationRequest, type DeviationScope, raisedMessage, scopeChoicesFor, validateDraft } from "./DeviationDraft"

/**
 * The command behind "Aerio: Raise a Compliance Deviation".
 *
 * A thin shell over {@link DeviationDraft}: this file owns the prompts and the error surfaces, and
 * nothing else. Every decision a user could get wrong — what a scope covers, what a rationale has to
 * contain, when a review date is required — lives in the pure module next door where it is tested
 * without an editor.
 *
 * ## The two things this must not let a user believe
 *
 * **That raising a deviation silences the finding.** It does not; it lands as `proposed`. Somebody
 * who thinks otherwise will not chase the approval and will be surprised when the build stays red,
 * so the confirmation says so in the first sentence.
 *
 * **That it can be approved from here.** It cannot, and the omission is deliberate rather than
 * unfinished: approval must name an authority other than the raiser, and offering the button in the
 * same editor session as the person who raised it is the shape of a rubber stamp. Approval goes
 * through the evidence API — `POST /projects/:key/deviations/:id/decision` — which is a reviewer's
 * surface, not an author's.
 */

/** Findings are offered newest-first per file; more than this and the picker stops being a picker. */
const MAX_FINDINGS_OFFERED = 50

export interface RaiseDeviationDeps {
	/** Findings for the file in question. Supplied by the caller so this never re-runs an analysis. */
	findings: ComplianceFinding[]
	/**
	 * The violation the user already pointed at, from the lightbulb.
	 *
	 * When set, the finding picker is skipped and the flow opens on the scope question. Asking "which
	 * violation?" after somebody has clicked the lightbulb on one specific squiggle would be asking
	 * them to repeat themselves, and the list they would be choosing from includes findings they did
	 * not point at.
	 */
	finding?: ComplianceFinding
	client?: EvidenceClient
	projectKey?: string | null
}

/**
 * Ask which finding, at what scope, and why — then raise it.
 *
 * Returns the raised record, or null when the user cancelled or the command could not proceed. Never
 * throws: a cancelled quick-pick and a backend that is down both end with the user informed and the
 * editor unchanged.
 */
export async function raiseDeviation(deps: RaiseDeviationDeps): Promise<Record<string, unknown> | null> {
	const projectKey = deps.projectKey !== undefined ? deps.projectKey : resolveComplianceProjectKey()
	if (!projectKey) {
		// Not an error the user caused. A deviation is a record against a project, and without
		// certification running there is no project for it to belong to.
		vscode.window.showWarningMessage(
			"A deviation is recorded against a certification project, and this workspace does not have one. " +
				"Turn on certification for this project first.",
		)
		return null
	}

	// The lightbulb path supplies the finding; the palette path asks. Note the preselected finding is
	// used as given and not looked up in `findings` — the code action took it from the same published
	// set, and re-matching it here would only add a way for the two to disagree.
	let finding = deps.finding ?? null
	if (!finding) {
		const candidates = deps.findings.filter((candidate) => candidate.mandatory || candidate.deviated)
		if (candidates.length === 0) {
			vscode.window.showInformationMessage("No mandatory findings here to raise a deviation against.")
			return null
		}

		finding = await pickFinding(candidates)
		if (!finding) {
			return null
		}
	}

	const scope = await pickScope(finding)
	if (!scope) {
		return null
	}

	const expiresAt = await askExpiry(scope)
	if (expiresAt === undefined) {
		return null
	}

	const rationale = await askRationale(finding, scope, expiresAt)
	if (!rationale) {
		return null
	}

	const draft = { finding, scope, rationale, expiresAt }
	const problems = validateDraft(draft)
	if (problems.length > 0) {
		// Reachable only if a prompt's own validator and this disagree, which is a bug rather than a
		// user mistake — so it is surfaced as an error rather than a gentle nudge back into the form.
		vscode.window.showErrorMessage(`Cannot raise this deviation: ${problems.join(" ")}`)
		return null
	}

	const request = buildDeviationRequest(draft)
	const client = deps.client ?? EvidenceClient.getInstance()

	try {
		const raised = await client.raiseDeviation(projectKey, request)
		vscode.window.showInformationMessage(raisedMessage(request))
		return raised as Record<string, unknown>
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		vscode.window.showErrorMessage(`Could not raise the deviation: ${message}`)
		return null
	}
}

async function pickFinding(findings: ComplianceFinding[]): Promise<ComplianceFinding | null> {
	if (findings.length === 1) {
		return findings[0]
	}

	const items = findings.slice(0, MAX_FINDINGS_OFFERED).map((finding) => ({
		label: `${finding.ruleId} — line ${finding.line}`,
		description: finding.deviated ? "already covered by a deviation" : finding.severity,
		detail: finding.message,
		finding,
	}))

	const choice = await vscode.window.showQuickPick(items, {
		placeHolder: "Which violation are you accepting?",
		matchOnDetail: true,
	})
	return choice?.finding ?? null
}

async function pickScope(finding: ComplianceFinding): Promise<DeviationScope | null> {
	const choices = scopeChoicesFor(finding).map((choice) => ({
		label: choice.label,
		detail: choice.detail,
		scope: choice.scope,
	}))

	const choice = await vscode.window.showQuickPick(choices, {
		placeHolder: "How much should this deviation cover? Narrower is better.",
		matchOnDetail: true,
	})
	return choice?.scope ?? null
}

/**
 * Ask for a review date.
 *
 * ⚠️ Returns `undefined` for cancelled and `null` for "no expiry", which are different outcomes and
 * would be indistinguishable if both were falsy in the same way. A project-wide deviation cannot be
 * open-ended, so there its prompt has no skip.
 */
async function askExpiry(scope: DeviationScope): Promise<string | null | undefined> {
	const required = scope === "rule"
	const answer = await vscode.window.showInputBox({
		prompt: required
			? "Review date (YYYY-MM-DD). A project-wide deviation cannot be open-ended."
			: "Review date (YYYY-MM-DD), or leave blank for no expiry.",
		placeHolder: "2027-01-31",
		validateInput: (value) => {
			const trimmed = value.trim()
			if (trimmed === "") {
				return required ? "A project-wide deviation needs a review date." : null
			}
			const parsed = new Date(trimmed)
			if (Number.isNaN(parsed.getTime())) {
				return "Use YYYY-MM-DD."
			}
			return parsed <= new Date() ? "That date has already passed." : null
		},
	})

	if (answer === undefined) {
		return undefined
	}
	return answer.trim() === "" ? null : answer.trim()
}

async function askRationale(finding: ComplianceFinding, scope: DeviationScope, expiresAt: string | null): Promise<string | null> {
	const answer = await vscode.window.showInputBox({
		prompt: `Why is this ${finding.ruleId} violation acceptable? An auditor reads this instead of the code.`,
		placeHolder: "e.g. Generated from the hardware register map; the layout is fixed by silicon.",
		// Validated live against the same rules the request is built with, so the user cannot reach
		// submit with something that will be refused.
		validateInput: (value) => {
			const problems = validateDraft({ finding, scope, rationale: value, expiresAt })
			// Only the rationale's own problem belongs on this field. A missing review date is a
			// different prompt's business and would be confusing attached to this one.
			const own = problems.find((problem) => problem.includes("rationale"))
			return own ?? null
		},
	})

	return answer?.trim() || null
}
