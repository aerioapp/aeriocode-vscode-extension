import * as vscode from "vscode"
import { ComplianceDiagnostics, DIAGNOSTIC_SOURCE } from "./ComplianceDiagnostics"
import type { ComplianceFinding } from "./ComplianceClient"

/**
 * The lightbulb entry point for raising a deviation.
 *
 * ## Why this exists
 *
 * The raise and review commands shipped reachable only from the command palette — no button, no menu
 * entry, no code action. A programme with a mandatory finding it cannot clear had no way to discover
 * that deviations exist at all, which made the feature approximately as useful as not having built
 * it. The palette is where you go for something you already know the name of.
 *
 * A code action puts it where the decision is actually made: the cursor is on the violation, the
 * squiggle is under it, and "Fix with Aeriocode" is already in the same menu. *Fix it* and *I cannot
 * fix it* are the two honest answers to a finding, and they belong next to each other.
 *
 * ## Mandatory, undeviated findings only
 *
 * ⚠️ An advisory finding does not fail a gate, so there is nothing to waive. Offering a deviation on
 * one would invite a record that means nothing and would teach people that deviations are how you
 * silence advisories.
 *
 * A finding already covered by an approved deviation is excluded by the same test, because applying
 * one clears `mandatory`. That is the behaviour we want: the decision has been taken, and a lightbulb
 * proposing it again reads as though it had not. Re-raising to reopen a settled record is still
 * possible from the palette, which is the right home for a rare corrective action.
 */

/**
 * The action title, led by the rule it would waive.
 *
 * ⚠️ The rule id is not decoration, and its **position is the whole point**. Two rules firing on one
 * line is ordinary — a `goto` to a label at a function's last statement is CTRL-1 and CTRL-14
 * together — so the menu holds two entries, and titled generically they were character-for-character
 * identical.
 *
 * ⚠️ Naming the rule at the *end* did not fix that. The lightbulb menu is narrow and VS Code
 * truncates to fit, so "Raise a compliance deviation for CTRL-1…" was displayed as "Raise a
 * compliance deviation…" — the trailing rule id, the only thing that distinguished the two entries,
 * was the first thing cut. The fix looked correct in the source and changed nothing on screen.
 *
 * Leading with the rule id puts the distinguishing token where truncation cannot reach it.
 *
 * ⚠️ The rule id alone is still not always enough: one rule can fire twice in the span the lightbulb
 * covers — a label and a `goto` are both CTRL-1 — and then two entries read identically again. When
 * that happens the line is added, because it is the only thing left that tells them apart. It is
 * omitted when the rule appears once, so the common case stays short.
 *
 * Trailing ellipsis because it opens a flow rather than doing something.
 */
export function raiseDeviationTitle(ruleId: string, line?: number): string {
	const subject = line === undefined ? ruleId : `${ruleId} line ${line}`
	return `${subject}: raise a compliance deviation…`
}

/**
 * Titles for a set of candidates, disambiguated only where they would otherwise collide.
 *
 * Exported so the collision rule is testable without constructing a provider.
 */
export function titlesFor(candidates: ComplianceFinding[]): string[] {
	const perRule = new Map<string, number>()
	for (const finding of candidates) {
		perRule.set(finding.ruleId, (perRule.get(finding.ruleId) ?? 0) + 1)
	}
	return candidates.map((finding) =>
		(perRule.get(finding.ruleId) ?? 0) > 1
			? raiseDeviationTitle(finding.ruleId, finding.line)
			: raiseDeviationTitle(finding.ruleId),
	)
}

/**
 * The finding a compliance diagnostic was built from, or null.
 *
 * Diagnostics and findings are matched on rule id plus start line rather than by identity: a
 * `vscode.Diagnostic` is a value type VS Code copies, so the object in `context.diagnostics` is
 * never the one that was published. Both fields are needed — a file can hold several findings for
 * one rule (four `goto`s in one function is four CTRL-1 findings) and several rules on one line.
 *
 * Exported for tests, which is why it takes findings rather than reaching for the singleton.
 */
export function findingForDiagnostic(diagnostic: vscode.Diagnostic, findings: ComplianceFinding[]): ComplianceFinding | null {
	if (diagnostic.source !== DIAGNOSTIC_SOURCE) {
		return null
	}

	// Findings are 1-based on lines, vscode.Range is 0-based.
	const line = diagnostic.range.start.line + 1
	return findings.find((finding) => finding.ruleId === diagnostic.code && finding.line === line) ?? null
}

/**
 * Findings worth offering a deviation for, in the order their diagnostics appear.
 *
 * Deduplicated by fingerprint: VS Code can hand the same diagnostic to a provider more than once
 * when ranges overlap, and two identical lightbulb entries would look like two different decisions.
 */
export function deviationCandidates(
	diagnostics: readonly vscode.Diagnostic[],
	findings: ComplianceFinding[],
): ComplianceFinding[] {
	const seen = new Set<string>()
	const candidates: ComplianceFinding[] = []

	for (const diagnostic of diagnostics) {
		const finding = findingForDiagnostic(diagnostic, findings)
		if (!finding || !finding.mandatory) {
			continue
		}
		// Fingerprint is the server's identity for the violation; the line is the fallback for a
		// backend older than this extension, which sends none.
		//
		// ⚠️ The rule id is in the key either way. It is redundant against a correct fingerprint, but
		// two rules firing on one line is ordinary — a `goto` to a label at a function's last statement
		// is CTRL-1 and CTRL-14 together — and if those ever shared a key the menu would silently offer
		// a deviation for one of them only. An extra entry is a visible flaw; a missing one is not.
		const key = `${finding.ruleId}:${finding.fingerprint ?? finding.line}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		candidates.push(finding)
	}

	return candidates
}

export class DeviationCodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

	private readonly diagnostics: () => ComplianceDiagnostics

	// Injected as a thunk rather than an instance: the singleton is created during activation and
	// this provider is registered alongside it, so resolving eagerly would capture whichever
	// instance existed at registration time and miss a later setInstance() in tests.
	constructor(diagnostics: () => ComplianceDiagnostics = () => ComplianceDiagnostics.getInstance()) {
		this.diagnostics = diagnostics
	}

	provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): vscode.CodeAction[] {
		const findings = this.diagnostics().findingsFor(document.uri.fsPath)
		if (findings.length === 0) {
			return []
		}

		const candidates = deviationCandidates(context.diagnostics, findings)
		// Titles are computed over the whole set rather than per finding, because whether a title needs
		// its line depends on what else is in the menu beside it.
		const titles = titlesFor(candidates)

		return candidates.map((finding, index) => {
			const title = titles[index]
			const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix)
			action.command = {
				command: "aeriocode.raiseComplianceDeviation",
				title,
				// The finding travels with the action, so the flow opens on the scope question rather
				// than asking which violation the user means when they have already pointed at one.
				arguments: [finding],
			}
			// Below any autofix VS Code offers for the same squiggle. Repairing the violation is the
			// better outcome and should stay the first thing the menu proposes.
			action.isPreferred = false
			return action
		})
	}
}
