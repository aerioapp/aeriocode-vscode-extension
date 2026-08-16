import * as vscode from "vscode"
import { HostProvider } from "@/hosts/host-provider"
import { definedRuleCount } from "@/shared/compliance-coverage"
import { ShowMessageType } from "@/shared/proto/host/window"
import { asRelativePath } from "@/utils/path"
import { ComplianceApiError, ComplianceClient, type AnalyzeResult, type ComplianceFinding } from "./ComplianceClient"

/**
 * User-facing compliance checking: runs the backend analysis on the active editor and
 * publishes the result into the Problems panel.
 *
 * Separate from the AI tool path in ToolExecutor — this is the "I want to check this
 * file myself" flow, and it works regardless of which model is selected.
 */

/** Exported so the deviation code action can tell our diagnostics from every other provider's. */
export const DIAGNOSTIC_SOURCE = "Aeriocode compliance"

/**
 * Mandatory rules ("shall", "will" and their negations) are errors; advisory "should"
 * rules are warnings. Mapping severity this way means the Problems panel error count is
 * the count of things that actually block conformance.
 */
function severityOf(finding: ComplianceFinding): vscode.DiagnosticSeverity {
	if (finding.mandatory) {
		return finding.confidence === "high" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
	}
	return vscode.DiagnosticSeverity.Information
}

function toDiagnostic(finding: ComplianceFinding): vscode.Diagnostic {
	// Findings use 1-based lines and 0-based columns; vscode.Range is 0-based on both.
	const range = new vscode.Range(
		Math.max(0, finding.line - 1),
		Math.max(0, finding.column),
		Math.max(0, finding.endLine - 1),
		Math.max(0, finding.endColumn),
	)

	const qualifier = finding.confidence === "high" ? "" : ` (confidence: ${finding.confidence})`
	const diagnostic = new vscode.Diagnostic(range, `${finding.message}${qualifier}`, severityOf(finding))

	diagnostic.source = DIAGNOSTIC_SOURCE
	diagnostic.code = finding.ruleId

	if (finding.rule.summary) {
		diagnostic.relatedInformation = []
	}

	return diagnostic
}

export class ComplianceDiagnostics implements vscode.Disposable {
	private static instance: ComplianceDiagnostics | undefined

	private readonly collection: vscode.DiagnosticCollection

	private readonly client: ComplianceClient

	/**
	 * The findings behind the diagnostics currently shown, by file.
	 *
	 * ⚠️ Kept because a `vscode.Diagnostic` cannot carry one. Raising a deviation needs the rule id,
	 * the standard, and the server's fingerprint for the violation — and a Diagnostic has room for a
	 * code and a message, so reconstructing a finding from what the Problems panel holds is not
	 * possible. Rebuilding it by re-running the analysis would be a second call whose result could
	 * differ from what the user is looking at.
	 *
	 * Cleared alongside the collection, so it can never outlive the diagnostics it describes.
	 */
	private readonly findingsByPath = new Map<string, ComplianceFinding[]>()

	// Explicit assignment rather than a parameter property — see ComplianceClient.ts.
	constructor(client: ComplianceClient = ComplianceClient.getInstance()) {
		this.client = client
		this.collection = vscode.languages.createDiagnosticCollection("aeriocode-compliance")
	}

	/**
	 * The instance owned by the extension host. The webview panel's gRPC handlers publish
	 * through this so panel results and command-palette results share one collection —
	 * otherwise the Problems panel would accumulate duplicate entries from each path.
	 */
	static getInstance(): ComplianceDiagnostics {
		if (!ComplianceDiagnostics.instance) {
			ComplianceDiagnostics.instance = new ComplianceDiagnostics()
		}
		return ComplianceDiagnostics.instance
	}

	static setInstance(instance: ComplianceDiagnostics | undefined): void {
		ComplianceDiagnostics.instance = instance
	}

	dispose(): void {
		this.collection.dispose()
		if (ComplianceDiagnostics.instance === this) {
			ComplianceDiagnostics.instance = undefined
		}
	}

	private publish(uri: vscode.Uri, result: AnalyzeResult): void {
		this.collection.set(
			uri,
			result.findings.map((finding) => toDiagnostic(finding)),
		)
		this.findingsByPath.set(uri.fsPath, result.findings)
	}

	/**
	 * Replace diagnostics for a whole run.
	 *
	 * Files that were analyzed but produced nothing are explicitly cleared: leaving a
	 * previous run's squiggles on a file that is now clean would be actively misleading.
	 */
	publishRun(findingsByAbsolutePath: Map<string, ComplianceFinding[]>, analyzedAbsolutePaths: string[]): void {
		for (const absolutePath of analyzedAbsolutePaths) {
			const uri = vscode.Uri.file(absolutePath)
			const findings = findingsByAbsolutePath.get(absolutePath) ?? []
			this.collection.set(
				uri,
				findings.map((finding) => toDiagnostic(finding)),
			)
			this.findingsByPath.set(absolutePath, findings)
		}
	}

	/**
	 * The findings behind the diagnostics shown for a file, or an empty list.
	 *
	 * Empty means "nothing published for this file", never "this file is clean" — the two are
	 * indistinguishable here and a caller must not read the second from the first.
	 */
	findingsFor(absolutePath: string): ComplianceFinding[] {
		return this.findingsByPath.get(absolutePath) ?? []
	}

	/**
	 * Prompt for a standard, analyze the active file, publish diagnostics.
	 */
	async checkActiveFile(): Promise<void> {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			HostProvider.window.showMessage({
				type: ShowMessageType.WARNING,
				message: "Open a source file to check its compliance.",
			})
			return
		}

		try {
			const standards = await this.client.listStandards()
			if (standards.length === 0) {
				HostProvider.window.showMessage({
					type: ShowMessageType.WARNING,
					message: "No compliance standards are available for your Aerio account.",
				})
				return
			}

			// Populated from the backend registry, so a newly registered standard appears
			// here without any change to the extension.
			const picked =
				standards.length === 1
					? standards[0]
					: await vscode.window
							.showQuickPick(
								standards.map((standard) => ({
									label: standard.name,
									description:
										`${standard.languages.join("/")} — ${standard.rules.automated} of ` +
										`${definedRuleCount(standard.rules.automated, standard.rules.manualReview)} rules checked automatically` +
										(standard.rules.partiallyAutomated
											? ` (${standard.rules.partiallyAutomated} in part)`
											: ""),
									detail: standard.title,
									standard,
								})),
								{ placeHolder: "Select a coding standard" },
							)
							.then((choice) => choice?.standard)

			if (!picked) {
				return
			}

			const document = editor.document
			const relativePath = await asRelativePath(document.uri.fsPath)

			const result = await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Window, title: `Checking ${picked.name} compliance…` },
				() =>
					this.client.analyze(picked.id, [{ path: relativePath, content: document.getText() }], {
						trigger: "diagnostics",
					}),
			)

			this.publish(document.uri, result)

			if (result.skipped.length > 0) {
				HostProvider.window.showMessage({
					type: ShowMessageType.WARNING,
					message: `${picked.name}: ${result.skipped[0].reason}`,
				})
				return
			}

			const { summary } = result
			// Always state coverage alongside the verdict — "no violations" over a subset of
			// rules is not the same as conformance, and the message must not imply it is.
			const coverage = `${summary.coverage.rulesAutomated} of ${definedRuleCount(summary.coverage.rulesAutomated, summary.coverage.rulesManualReview)} rules checked automatically; ${summary.coverage.rulesManualReview} need manual review.`

			if (summary.totalFindings === 0) {
				HostProvider.window.showMessage({
					type: ShowMessageType.INFORMATION,
					message: `${picked.name}: no violations found. ${coverage}`,
				})
			} else if (summary.mandatoryClean) {
				HostProvider.window.showMessage({
					type: ShowMessageType.INFORMATION,
					message: `${picked.name}: ${summary.totalFindings} advisory finding(s), no mandatory violations. ${coverage}`,
				})
			} else {
				HostProvider.window.showMessage({
					type: ShowMessageType.WARNING,
					message: `${picked.name}: ${summary.mandatoryViolations} mandatory violation(s) of ${summary.totalFindings} finding(s). ${coverage}`,
				})
			}
		} catch (error) {
			const message = error instanceof ComplianceApiError ? error.message : ((error as Error)?.message ?? String(error))
			HostProvider.window.showMessage({
				type: ShowMessageType.ERROR,
				message: `Compliance check failed: ${message}`,
			})
		}
	}

	/** Drop diagnostics for a file, or all files when no uri is given. */
	clear(uri?: vscode.Uri): void {
		if (uri) {
			this.collection.delete(uri)
			this.findingsByPath.delete(uri.fsPath)
		} else {
			this.collection.clear()
			// ⚠️ Cleared with the collection, never separately. Retained findings that outlived their
			// diagnostics would let a deviation be raised against a violation nobody can see any more.
			this.findingsByPath.clear()
		}
	}
}
