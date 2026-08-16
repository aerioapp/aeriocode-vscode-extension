import type { ComplianceFinding } from "./ComplianceClient"
import type { DeviationRequest } from "@/services/evidence/EvidenceClient"

/**
 * Turning a finding somebody wants to accept into a deviation the server will take.
 *
 * Pure and free of `vscode`, so the rules a user runs into — what scope means, what a rationale has
 * to contain, when a review date is required — can be tested without an editor. The command that
 * collects the answers is a thin shell over this.
 *
 * ## Why the validation is duplicated from the backend
 *
 * It is not duplicated for safety — the server validates independently and is the authority; a
 * client-side check that disagreed would be overruled. It is here so the user finds out *before*
 * typing three sentences of rationale that a project-wide waiver needs a review date, rather than
 * after a round trip. The failure being avoided is a form that rejects on submit.
 *
 * ⚠️ **The numbers must not drift from the backend's.** {@link MIN_RATIONALE_LENGTH} mirrors
 * `services/compliance/core/deviations.js`. If they diverge, the client either lets through what the
 * server rejects — the round trip this exists to avoid — or blocks what the server would accept,
 * which is worse because there is no way for the user to tell it is wrong.
 */

/** Mirrors `MIN_RATIONALE_LENGTH` in the backend's deviations module. */
export const MIN_RATIONALE_LENGTH = 30

export type DeviationScope = "finding" | "file" | "rule"

/** Scopes that may not be granted open-ended. Mirrors the backend's `REQUIRES_EXPIRY`. */
const REQUIRES_EXPIRY: ReadonlySet<DeviationScope> = new Set<DeviationScope>(["rule"])

export interface ScopeChoice {
	scope: DeviationScope
	label: string
	detail: string
}

/**
 * The scopes offered for a finding, narrowest first.
 *
 * Order is the recommendation: a picker presents these top to bottom, and the narrowest waiver that
 * does the job is the one a programme should take. `rule` is last and its detail says what it costs.
 *
 * ⚠️ `finding` is offered only when the finding carries a fingerprint. That is the server's identity
 * for it, and without one a finding-scoped deviation would be rejected — so it is withheld rather
 * than offered and refused. A finding arrives without one only from a backend older than this
 * extension.
 */
export function scopeChoicesFor(finding: ComplianceFinding): ScopeChoice[] {
	const choices: ScopeChoice[] = []

	if (finding.fingerprint) {
		choices.push({
			scope: "finding",
			label: "This violation only",
			detail: "Follows the code if it moves or is reindented. A second identical violation is not covered.",
		})
	}

	choices.push({
		scope: "file",
		label: `Every ${finding.ruleId} violation in ${finding.file}`,
		detail: "For a generated file, a vendored driver, or a hardware register map.",
	})

	choices.push({
		scope: "rule",
		label: `Every ${finding.ruleId} violation in the project`,
		detail: "States that the programme has tailored its standard. Requires a review date.",
	})

	return choices
}

export interface DraftInput {
	finding: ComplianceFinding
	scope: DeviationScope
	rationale: string
	/** ISO date. Required for a project-wide deviation; optional otherwise. */
	expiresAt?: string | null
	/** Injected so the expiry check is testable without waiting. */
	now?: Date
}

/**
 * Everything wrong with a draft, in the order a person would fix it.
 *
 * A list rather than the first problem, for the same reason the backend returns one: someone filling
 * in a form wants to know all of it at once.
 */
export function validateDraft(input: DraftInput): string[] {
	const problems: string[] = []
	const now = input.now ?? new Date()

	const rationale = (input.rationale ?? "").trim()
	if (rationale.length < MIN_RATIONALE_LENGTH) {
		problems.push(
			`The rationale needs at least ${MIN_RATIONALE_LENGTH} characters explaining why this violation is ` +
				`acceptable. It is what an auditor reads instead of the code.`,
		)
	}

	if (input.scope === "finding" && !input.finding.fingerprint) {
		problems.push("This finding has no identity from the server, so it cannot be waived individually. Use a wider scope.")
	}

	if (REQUIRES_EXPIRY.has(input.scope) && !input.expiresAt) {
		problems.push("A project-wide deviation needs a review date. An open-ended one is an unrecorded change to the standard.")
	}

	if (input.expiresAt) {
		const expiry = new Date(input.expiresAt)
		if (Number.isNaN(expiry.getTime())) {
			problems.push(`"${input.expiresAt}" is not a date. Use YYYY-MM-DD.`)
		} else if (expiry <= now) {
			problems.push("The review date is in the past, so the deviation would never take effect.")
		}
	}

	return problems
}

/**
 * Build the request, or throw with every problem in one message.
 *
 * Throws rather than returning a result type because the command has already validated and shown the
 * problems to the user — reaching here with an invalid draft is a programming error, not a user one.
 *
 * ⚠️ **No `deviationId`.** The id is a hash of what the deviation covers, and that derivation is the
 * server's: two people raising the same waiver must produce one record, and a second implementation
 * of the formula fails by producing *two* rather than by erroring. The route derives it when the
 * client omits it, which is why omitting it here is the correct thing to do rather than an oversight.
 */
export function buildDeviationRequest(input: DraftInput): Omit<DeviationRequest, "deviationId"> {
	const problems = validateDraft(input)
	if (problems.length > 0) {
		throw new Error(`Cannot raise this deviation: ${problems.join(" ")}`)
	}

	const { finding, scope } = input

	return {
		standard: finding.standard,
		ruleId: finding.ruleId,
		scope,
		// Sent only where the scope uses it. A file path on a project-wide deviation would read as a
		// restriction the record does not actually carry.
		file: scope === "rule" ? null : finding.file,
		fingerprint: scope === "finding" ? (finding.fingerprint ?? null) : null,
		rationale: input.rationale.trim(),
		expiresAt: input.expiresAt ?? null,
	}
}

/**
 * What to tell the user once it is raised.
 *
 * ⚠️ Says plainly that nothing is waived yet. The most likely misunderstanding at this moment is that
 * raising a deviation silences the finding — it does not, and a user who believes it does will not
 * chase the approval and will be surprised when the build stays red.
 */
export function raisedMessage(request: Omit<DeviationRequest, "deviationId">): string {
	const scopeWord =
		request.scope === "finding"
			? "this violation"
			: request.scope === "file"
				? `${request.ruleId} in ${request.file}`
				: `${request.ruleId} across the project`

	// ⚠️ Names the review command rather than offering a button for it. The raiser has to be able to
	// find the list — to check status, or to withdraw a proposal — and the command palette is not
	// discoverable from here otherwise. But a button would put the person who has just written the
	// rationale one click from the approval screen, which is the adjacency the two commands are kept
	// apart to avoid. Telling them where it is does not invite them to use it on their own record.
	return (
		`Deviation raised for ${scopeWord}. It is proposed, not approved — the finding is still reported and ` +
		`still fails the gate until an authority other than you approves it. ` +
		`Run "Aeriocode: Review Compliance Deviations" to see its status.`
	)
}
