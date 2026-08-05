import type { AnalyzeResult, ComplianceFile, ComplianceFinding } from "@/services/compliance/ComplianceClient"

/**
 * Checking generated code before the model is allowed to move on.
 *
 * A system prompt lowers the rate at which a model writes a violation. It does not stop one, it is
 * not reproducible between model versions, and no certification authority gives credit for having
 * told an assistant to follow a standard. The only thing that turns "probably conforms" into
 * something a person can act on is running the analysis and handing the result back.
 *
 * So on a safety profile this runs after every write: the file is analysed, and mandatory findings
 * come back to the model as a repair instruction naming the rule and the line. The model then has
 * the same information a reviewer would have, at the moment it is cheapest to act on.
 *
 * ## Why the write is not blocked
 *
 * The check happens *after* the file lands, not instead of it. Holding the write until the code is
 * clean sounds stricter and is worse: the model cannot see its own output to reason about it, a
 * partial edit leaves the file in neither state, and a rule the model cannot satisfy produces a
 * write that never completes. The file is written, the findings are reported, and the next turn
 * fixes them — which is what a person does.
 *
 * ## Why the attempts are bounded
 *
 * Some findings a model genuinely cannot clear: a rule needing a project-wide decision, a false
 * positive, a constraint that conflicts with what the user asked for. Repeating the instruction
 * then costs the user tokens on every turn and produces the same code, so after
 * {@link MAX_REPAIR_ATTEMPTS} the gate stops asking and says plainly that the findings stand. That
 * is a worse outcome than clean code and a much better one than a loop.
 *
 * The counter is per file and per session. It resets when the file's content changes materially,
 * because a model that rewrote the function deserves the attempts again.
 */

/** Repair turns offered per file before the gate stops asking and reports what remains. */
export const MAX_REPAIR_ATTEMPTS = 3

/**
 * ⚠️ **Directing repairs to `replace_in_file` is settled: it does not work, and the third test is the
 * one that says so.**
 *
 * The first two attempts were global and both reverted on the model never using the tool — but it was
 * *uncallable* the first time and the measurement was C-only the second, where files are a median of
 * 24 lines and a rewrite genuinely does affect most of the content, exactly as the base prompt says.
 * Neither could decide the question.
 *
 * The third asked it where the premise holds: C++, median 40 lines and up to 80, where repairs
 * introduce a new violation in 18 of 39 turns against C's 10 of 34. Directed above a 30-line
 * threshold, on a clean run:
 *
 *     targeted edits used                      0 → 6 of 37 repair turns
 *     repairs introducing a violation      18/39 → 16/37   (46% → 43%)
 *     never emitted a file                  2/24 → 5/24
 *     clean within the gate's three        17/24 → 13/24
 *
 * **The instruction was followed and the benefit did not arrive.** That is the informative version of
 * this result: a SEARCH/REPLACE block cannot change a line it does not mention, so the regression rate
 * should have fallen and it did not — the model regresses through the lines it *does* mention. And
 * asking for a harder-to-produce output cost files that never landed at all.
 *
 * The premise was wrong, not the delivery. Do not try a fourth framing of it.
 */

/** Findings named individually before the message switches to a count. */
const MAX_LISTED_FINDINGS = 12

export interface ComplianceProfile {
	/** A registered rule pack id, e.g. "aerio-scs". */
	standard: string
	/** DAL A–D, or an ASIL. Null where the project has not declared one. */
	level?: string | null
	regime?: string | null
}

export interface ComplianceGateHost {
	/** The active profile, or null when this is not a safety-critical session. */
	getProfile: () => ComplianceProfile | null
	analyze: (standard: string, files: ComplianceFile[]) => Promise<AnalyzeResult>
	/** Told about every gate outcome so the audit trail records that generated code was checked. */
	recordGateResult: (result: GateOutcome) => void
	/** Non-fatal reporting. A gate that cannot run must never take the write down with it. */
	warn: (message: string) => void
}

export interface GateOutcome {
	path: string
	standard: string
	ran: boolean
	attempt: number
	mandatoryViolations: number
	totalFindings: number
	ruleIds: string[]
	exhausted: boolean
	/** Present when the gate could not run. The write still succeeded. */
	skippedReason?: string
}

export interface GateResult {
	/** Appended to the tool result the model sees. Empty when there is nothing to say. */
	feedback: string
	outcome: GateOutcome
}

/**
 * Per-file attempt counts for one task.
 *
 * Content-keyed rather than a bare counter: a model that materially rewrote the file is making a
 * different attempt, not repeating one, and should get the full budget again. Without this a long
 * session on one file would exhaust its attempts early and stop reporting for the rest of the task.
 */
export class RepairLedger {
	private readonly attempts = new Map<string, { count: number; signature: string; violated: string[] }>()

	record(path: string, content: string): number {
		const signature = signatureOf(content)
		const previous = this.attempts.get(path)
		const count = previous && previous.signature === signature ? previous.count + 1 : 1
		this.attempts.set(path, { count, signature, violated: previous?.violated ?? [] })
		return count
	}

	/**
	 * Rules this file violated last time and does not now — the ones a rewrite is about to undo.
	 *
	 * ⚠️ About a quarter of repairs introduce a violation that was not there before: 8 to 10 of every
	 * 35 repair turns in C, and a repair that regresses costs the same turn as one that fails. The
	 * message already says "re-emit it exactly as it stands", which is generic enough to be read as
	 * background. Naming the rules the model *just fixed* is specific and checkable, and it needs no
	 * data the gate does not already have.
	 */
	fixedSincePreviousAttempt(path: string, nowViolated: string[]): string[] {
		const previous = this.attempts.get(path)?.violated ?? []
		const current = new Set(nowViolated)
		return previous.filter((ruleId) => !current.has(ruleId))
	}

	/** Recorded after each gate run so the next one can see what changed. */
	noteViolations(path: string, violated: string[]): void {
		const entry = this.attempts.get(path)
		if (entry) {
			entry.violated = violated
		}
	}

	reset(path: string): void {
		this.attempts.delete(path)
	}
}

/**
 * A cheap content signature that ignores reformatting.
 *
 * Whitespace is **removed**, not collapsed. Collapsing runs to a single space is not enough,
 * because reformatting routinely turns zero whitespace into some — `f(void){` becomes `f(void) {` —
 * and a signature that treats those as different would hand the budget back for a reindent. A model
 * that only reformatted has not addressed the finding.
 *
 * The cost is that `a b` and `ab` collide. That is acceptable here and would not be in a parser:
 * the signature only decides whether this is the same repair attempt or a new one, so a collision
 * costs one attempt rather than producing a wrong answer about the code.
 */
function signatureOf(content: string): string {
	return content.replace(/\s+/g, "")
}

/** Mandatory findings are the ones worth a turn. Advisory ones are reported, never repaired. */
function mandatoryFindings(result: AnalyzeResult): ComplianceFinding[] {
	return (result.findings || []).filter((finding) => finding.mandatory)
}

function describeFinding(finding: ComplianceFinding): string {
	const where = `line ${finding.line}`
	const fixable = finding.fixable === "safe" ? " (compliance_check can fix this one automatically)" : ""
	// ⚠️ Appending the rule's `authoringAction` — what to *write*, beside the finding that says what is
	// wrong — was the widest-surface candidate this programme found: 60% of observed C violations and
	// 30% of C++ are of rules carrying one. **It moved nothing.** Clean within one repair went 17/24
	// to 15/24, inside the ±3 floor, on a run with zero completion errors.
	//
	// Third independent confirmation of the same thing. Asked directly, the model recited LAYOUT-5
	// perfectly and then omitted it from 5 of 8 files; retrieval was ruled out on that evidence; and
	// now the instruction placed at the exact moment it is actionable changes nothing. **These are not
	// failures of knowing the rule.** Which is the argument for the gate itself: a checker that runs is
	// worth more than any number of ways of asking.
	return `- ${finding.ruleId} at ${where}: ${finding.message}${fixable}`
}

/**
 * Run the gate over one written file.
 *
 * Never throws. A backend that is down, a language the standard does not cover, or a file too large
 * to analyse all produce a skipped outcome and an empty feedback string — the write has already
 * succeeded, and failing the turn because the checker was unavailable would make the tool less
 * usable without making any code safer.
 */
export async function runComplianceGate(
	relPath: string,
	content: string,
	ledger: RepairLedger,
	host: ComplianceGateHost,
): Promise<GateResult> {
	const profile = host.getProfile()
	const base: GateOutcome = {
		path: relPath,
		standard: profile?.standard || "",
		ran: false,
		attempt: 0,
		mandatoryViolations: 0,
		totalFindings: 0,
		ruleIds: [],
		exhausted: false,
	}

	if (!profile || !profile.standard) {
		// Not a safety-critical session. Silence, not a skip notice — every write outside such a
		// session would otherwise carry a line explaining that nothing happened.
		return { feedback: "", outcome: { ...base, skippedReason: "no-compliance-profile" } }
	}

	let result: AnalyzeResult
	try {
		result = await host.analyze(profile.standard, [{ path: relPath, content }])
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		host.warn(`Compliance gate could not analyse ${relPath}: ${message}`)
		const outcome = { ...base, skippedReason: `analysis-failed: ${message}` }
		host.recordGateResult(outcome)
		// Told to the model rather than swallowed. It must not conclude from silence that the file
		// was checked and found clean — that is the one wrong inference available here.
		return {
			feedback:
				`\n\nCompliance gate: ${relPath} could NOT be checked against ${profile.standard} (${message}). ` +
				`Do not treat this file as verified. Re-run compliance_check on it before completing.`,
			outcome,
		}
	}

	// A file the standard does not cover — a .py in a C project, say. The backend reports it as
	// skipped rather than clean, and passing that on as a violation-free result would be a false
	// claim about a file nothing looked at.
	if (result.summary.filesAnalyzed === 0) {
		const outcome = { ...base, skippedReason: "language-not-covered" }
		host.recordGateResult(outcome)
		return { feedback: "", outcome }
	}

	const mandatory = mandatoryFindings(result)
	const attempt = mandatory.length > 0 ? ledger.record(relPath, content) : 0
	const nowViolated = [...new Set(mandatory.map((finding) => finding.ruleId))]
	// Read before the ledger is updated: these are the rules the last attempt violated and this one
	// does not, which is precisely what a whole-file rewrite is about to undo.
	const justFixed = ledger.fixedSincePreviousAttempt(relPath, nowViolated)
	ledger.noteViolations(relPath, nowViolated)
	if (mandatory.length === 0) {
		ledger.reset(relPath)
	}

	const outcome: GateOutcome = {
		...base,
		ran: true,
		attempt,
		mandatoryViolations: mandatory.length,
		totalFindings: result.summary.totalFindings,
		ruleIds: [...new Set(mandatory.map((finding) => finding.ruleId))],
		exhausted: attempt > MAX_REPAIR_ATTEMPTS,
	}
	host.recordGateResult(outcome)

	if (mandatory.length === 0) {
		// Deliberately not "this file is compliant". The gate checked one file against the rules
		// that can be checked automatically, which is a much smaller statement, and the model is
		// about to repeat whatever it is told here to the user.
		return {
			feedback:
				`\n\nCompliance gate: ${relPath} has no mandatory findings against ${profile.standard}. ` +
				`This covers only the automatically checkable rules for this one file — it is not conformance.`,
			outcome,
		}
	}

	if (outcome.exhausted) {
		// Stop asking. Repeating the instruction now costs the user a turn per attempt and produces
		// the same code, and an unexplained deviation is worse than a reported one.
		return {
			feedback:
				`\n\nCompliance gate: ${relPath} still has ${mandatory.length} mandatory finding(s) against ` +
				`${profile.standard} after ${MAX_REPAIR_ATTEMPTS} attempts, so no further repair will be requested.\n` +
				mandatory.slice(0, MAX_LISTED_FINDINGS).map(describeFinding).join("\n") +
				`\n\nDo not attempt another fix. Tell the user these findings remain, name them, and say why you ` +
				`could not clear them — a deviation somebody decided on is acceptable, a silent one is not.`,
			outcome,
		}
	}

	const listed = mandatory.slice(0, MAX_LISTED_FINDINGS)
	const overflow = mandatory.length - listed.length

	return {
		feedback:
			`\n\nCompliance gate: ${relPath} has ${mandatory.length} mandatory finding(s) against ${profile.standard}` +
			`${profile.level ? ` at level ${profile.level}` : ""} (attempt ${attempt} of ${MAX_REPAIR_ATTEMPTS}).\n` +
			listed.map(describeFinding).join("\n") +
			(overflow > 0 ? `\n- …and ${overflow} more.` : "") +
			// ⚠️ The scope instruction is the load-bearing part, and it was missing.
			//
			// Measured over 24 benchmark tasks per language: of the files that still failed after a
			// repair, **the repair had introduced a violation that was not there before** in 6 of 8
			// C cases and 5 of 10 C++ cases — far more often than the original finding survived the
			// fix. The model was not failing to repair; it was repairing and regressing something
			// else while re-emitting the file.
			//
			// "Fix these now, in this file" reads as licence to rewrite the file, and `write_to_file`
			// requires re-emitting all of it, so a rule satisfied on the first attempt gets dropped
			// on the second. Naming what must *not* change is what makes the repair a repair.
			// ⚠️ Directing the repair to `replace_in_file` was tried here and **reverted**, because it
			// did not happen. A SEARCH/REPLACE edit cannot regress a line it does not mention, so
			// making the scope structural rather than requested looked like the obvious next move.
			// Measured over 24 tasks per language: the model used the edit tool **zero times**. The
			// instruction was read and not followed, and the numbers around it moved in opposite
			// directions on the two languages (C regressions 12 → 4, C++ 11 → 18; 23 → 22 together),
			// which is what a change with no effect looks like through sampling noise.
			//
			// ⚠️ **Asked again properly, and reverted again — this time on evidence that means
			// something.** The first revert's number (zero uses in 24 tasks) was worthless, because
			// `replace_in_file` was uncallable at the time: the prompt named it 27 times without ever
			// demonstrating the call, so `ToolExecutor` answered `missing required parameter 'diff'`
			// every time. Zero was the only possible outcome, whatever the gate asked for.
			//
			// With the tool callable, the worked example shipped, and the harness able to apply a
			// SEARCH block that drops blank lines, it was re-measured over 24 C tasks:
			//
			//   targeted edits used     0 → 3 of 35 repair turns
			//   needed the no-tool nudge  4/24 → 16/24
			//   clean within one repair   17/24 → 11/24
			//
			// Adoption barely moved, and the two costs are both far outside the ±3 sampling floor. The
			// nudge count stayed at 16 *after* the blank-line matcher landed, so those round trips are
			// the instruction's, not the instrument's. Writing a SEARCH block that matches is harder
			// than re-emitting a forty-line file, and every failed attempt costs the user a turn — the
			// exact cost this gate exists to reduce.
			//
			// So the base prompt was right for a reason that survives the tool being fixed: prefer
			// `write_to_file` when the file is small and the change touches most of it. The remedy for
			// repair regression is naming what must not change, which is what the sentence below does
			// and what measured 6 → 1 on new violations introduced.
			`\n\nFix these now, in this file, before doing anything else. Change only what these findings ` +
			`require: every other line already passed the check, so re-emit it exactly as it stands — ` +
			`including the file header, the types, and the assertions. A repair that fixes one finding ` +
			`and introduces another has cost the user a turn for nothing.\n` +
			// ⚠️ Naming the rules the previous attempt cleared — "your last attempt fixed LAYOUT-5, that
			// fix must survive this one" — was built and **measured to do nothing**. Repairs introducing
			// a violation absent before: 8–10 of 35 turns before, 10 of 34 after, on a run with zero
			// completion errors. The count it was designed to move did not move.
			`If a finding cannot be fixed, say which and why rather than leaving it unmentioned.`,
		outcome,
	}
}
