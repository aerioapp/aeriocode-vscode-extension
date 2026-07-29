import { definedRuleCount } from "@shared/compliance-coverage"
import type { AnalyzeResult, AutofixResult, ComplianceFinding } from "./ComplianceClient"

/**
 * Render compliance results as text for the model.
 *
 * The wording matters: the model acts on this directly, so the output has to be clear
 * about what was *not* checked. A result that reads as "no violations" when 187 rules
 * were never evaluated would invite a false claim of conformance.
 */

const MAX_FINDINGS_RENDERED = 200

function formatFinding(finding: ComplianceFinding): string {
	const location = finding.line === finding.endLine ? `line ${finding.line}` : `lines ${finding.line}-${finding.endLine}`
	const confidence = finding.confidence === "high" ? "" : ` [confidence: ${finding.confidence}]`
	const fixable = finding.fixable ? ` [autofix: ${finding.fixable}]` : ""

	return `AV Rule ${finding.ruleId} (${finding.severity}) — ${location}${confidence}${fixable}\n    ${finding.message}`
}

export function formatAnalyzeResult(result: AnalyzeResult): string {
	const { summary } = result
	const lines: string[] = []

	lines.push(`${result.standardName} compliance analysis (${result.standardVersion})`)
	lines.push(
		`Analyzed ${summary.filesAnalyzed} file(s). ${summary.totalFindings} finding(s) across ${summary.rulesViolated} rule(s).`,
	)

	if (summary.truncated) {
		// The model must not treat a capped list as the whole picture and declare the file
		// done once it has fixed everything it can see.
		lines.push(
			`NOTE: only ${summary.returnedFindings} of ${summary.totalFindings} findings are listed below. ` +
				`Fix these, then run the check again to see the rest.`,
		)
	}

	if (summary.mandatoryClean) {
		lines.push("No mandatory (shall / will) rule violations.")
	} else {
		lines.push(`${summary.mandatoryViolations} MANDATORY violation(s) — these must be fixed.`)
	}

	if (summary.score !== null) {
		lines.push(`Score: ${summary.score}% — ${summary.scoreDefinition}`)
	}

	// Always state coverage. A clean run over 42 of 229 rules is not full conformance,
	// and the model must not report it as such.
	lines.push(
		`Coverage: ${summary.coverage.rulesAutomated} of ` +
			`${definedRuleCount(summary.coverage.rulesAutomated, summary.coverage.rulesManualReview)} ` +
			`rules are checked automatically. ` +
			`${summary.coverage.rulesManualReview} require human review and were NOT evaluated.`,
	)

	if (result.skipped.length > 0) {
		lines.push("")
		lines.push("Not analyzed:")
		for (const skip of result.skipped) {
			lines.push(`  ${skip.path}: ${skip.reason}`)
		}
	}

	if (result.parseErrors.length > 0) {
		lines.push("")
		lines.push("Parse warnings (results for these files may be incomplete):")
		for (const parseError of result.parseErrors) {
			lines.push(`  ${parseError.path}: ${parseError.reason}`)
		}
	}

	if (result.findings.length === 0) {
		lines.push("")
		lines.push("No violations found among the automatically-checked rules.")
		return lines.join("\n")
	}

	const rendered = result.findings.slice(0, MAX_FINDINGS_RENDERED)
	const byFile = new Map<string, ComplianceFinding[]>()
	for (const finding of rendered) {
		const list = byFile.get(finding.file) ?? []
		list.push(finding)
		byFile.set(finding.file, list)
	}

	for (const [file, findings] of byFile) {
		lines.push("")
		lines.push(`${file}:`)
		for (const finding of findings) {
			lines.push(`  ${formatFinding(finding).split("\n").join("\n  ")}`)
		}
	}

	if (result.findings.length > rendered.length) {
		lines.push("")
		lines.push(`... and ${result.findings.length - rendered.length} more finding(s) not shown.`)
	}

	return lines.join("\n")
}

export function formatAutofixResult(result: AutofixResult): string {
	const lines: string[] = []

	lines.push(`${result.standardName} autofix (tier: ${result.tier})`)
	lines.push(
		`${result.summary.fixesApplied} fix(es) applied across ${result.summary.filesChanged} file(s); ` +
			`${result.summary.fixesSkipped} skipped. ${result.summary.findingsBefore} finding(s) before fixing.`,
	)

	if (result.summary.fixesApplied === 0) {
		lines.push("")
		lines.push("Nothing was fixed mechanically. The remaining violations need a human decision.")
	}

	for (const file of result.files) {
		if (!file.changed && file.skipped.length === 0) {
			continue
		}

		lines.push("")
		lines.push(`${file.file}:`)

		for (const applied of file.applied) {
			lines.push(`  fixed AV Rule ${applied.ruleId} at line ${applied.line} — ${applied.description}`)
		}
		for (const skipped of file.skipped) {
			lines.push(`  skipped AV Rule ${skipped.ruleId} at line ${skipped.line} — ${skipped.reason}`)
		}

		if (file.diff) {
			lines.push("")
			lines.push("```diff")
			lines.push(file.diff.trimEnd())
			lines.push("```")
		}
	}

	lines.push("")
	lines.push(
		"The fixed content has NOT been written to disk. Use write_to_file or replace_in_file to apply it so the user can review the change.",
	)

	return lines.join("\n")
}
