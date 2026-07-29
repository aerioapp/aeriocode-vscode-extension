import * as path from "path"
import { Controller } from ".."
import {
	ComplianceCheckResponse,
	ComplianceFileNote,
	ComplianceFinding,
	ComplianceSummary,
	RunComplianceCheckRequest,
} from "@shared/proto/aeriocode/compliance"
import { ComplianceApiError, ComplianceClient, type ComplianceFile } from "@/services/compliance/ComplianceClient"
import { ComplianceDiagnostics } from "@/services/compliance/ComplianceDiagnostics"
import type { ComplianceFinding as ClientFinding } from "@/services/compliance/ComplianceClient"
import { AeriocodeIgnoreController } from "@/core/ignore/AeriocodeIgnoreController"
import { extractTextFromFile } from "@integrations/misc/extract-text"
import { getWorkspacePath } from "@/utils/path"
import { telemetryService } from "@/services/telemetry"

/**
 * Analyze the selected files and publish the findings as diagnostics.
 *
 * This is the panel's equivalent of the AI's compliance_check tool. It goes through the
 * same backend and the same client, so both paths report identical results.
 */
export async function runComplianceCheck(
	_controller: Controller,
	request: RunComplianceCheckRequest,
): Promise<ComplianceCheckResponse> {
	if (!request.standard) {
		return ComplianceCheckResponse.create({ error: "No compliance standard was selected." })
	}
	if (request.paths.length === 0) {
		return ComplianceCheckResponse.create({ error: "Select at least one file to check." })
	}

	const workspacePath = await getWorkspacePath()
	if (!workspacePath) {
		return ComplianceCheckResponse.create({ error: "No workspace folder is open." })
	}

	// Re-check .aeriocodeignore here rather than trusting the list the panel sent: the
	// webview's selection is user input, and the ignore file is a boundary the user asked
	// to be enforced.
	const ignoreController = new AeriocodeIgnoreController(workspacePath)
	await ignoreController.initialize()

	const files: ComplianceFile[] = []
	const absoluteByPath = new Map<string, string>()
	const unreadable: ComplianceFileNote[] = []

	for (const relativePath of request.paths) {
		if (!ignoreController.validateAccess(relativePath)) {
			unreadable.push(ComplianceFileNote.create({ path: relativePath, reason: "Blocked by .aeriocodeignore" }))
			continue
		}

		const absolutePath = path.resolve(workspacePath, relativePath)
		try {
			const content = await extractTextFromFile(absolutePath)
			files.push({ path: relativePath, content })
			absoluteByPath.set(relativePath, absolutePath)
		} catch (error) {
			unreadable.push(
				ComplianceFileNote.create({ path: relativePath, reason: `Could not read: ${(error as Error).message}` }),
			)
		}
	}

	if (files.length === 0) {
		return ComplianceCheckResponse.create({
			error: "None of the selected files could be read.",
			skipped: unreadable,
		})
	}

	try {
		const result = await ComplianceClient.getInstance().analyze(request.standard, files)

		// Group by file so each document's diagnostics replace that document's previous
		// ones. Analyzed-but-clean files are cleared explicitly.
		const byAbsolutePath = new Map<string, ClientFinding[]>()
		for (const finding of result.findings) {
			const absolutePath = absoluteByPath.get(finding.file)
			if (!absolutePath) {
				continue
			}
			const bucket = byAbsolutePath.get(absolutePath)
			if (bucket) {
				bucket.push(finding)
			} else {
				byAbsolutePath.set(absolutePath, [finding])
			}
		}
		ComplianceDiagnostics.getInstance().publishRun(byAbsolutePath, [...absoluteByPath.values()])

		telemetryService.captureButtonClick("compliance_panel_analyze")

		const { summary } = result
		return ComplianceCheckResponse.create({
			standard: result.standard,
			standardName: result.standardName,
			standardVersion: result.standardVersion,
			findings: result.findings.map((finding) =>
				ComplianceFinding.create({
					ruleId: finding.ruleId,
					severity: finding.severity,
					mandatory: finding.mandatory,
					file: finding.file,
					line: finding.line,
					column: finding.column,
					endLine: finding.endLine,
					endColumn: finding.endColumn,
					message: finding.message,
					confidence: finding.confidence,
					fixable: finding.fixable ?? "",
					ruleStatement: finding.rule?.statement ?? "",
					ruleRationale: finding.rule?.rationale ?? "",
				}),
			),
			summary: ComplianceSummary.create({
				filesAnalyzed: summary.filesAnalyzed,
				totalFindings: summary.totalFindings,
				returnedFindings: summary.returnedFindings ?? result.findings.length,
				truncated: summary.truncated ?? false,
				rulesViolated: summary.rulesViolated,
				mandatoryViolations: summary.mandatoryViolations,
				mandatoryClean: summary.mandatoryClean,
				// Proto has no optional double here; tenths keep one decimal of precision and
				// -1 distinguishes "no score" from a genuine 0%.
				scoreTenths: summary.score === null ? -1 : Math.round(summary.score * 10),
				scoreDefinition: summary.scoreDefinition,
				rulesInStandard: summary.coverage.rulesInStandard,
				rulesAutomated: summary.coverage.rulesAutomated,
				rulesManualReview: summary.coverage.rulesManualReview,
				rulesAbsentFromSource: summary.coverage.rulesAbsentFromSource,
				absentRuleIds: summary.coverage.absentRuleIds,
			}),
			skipped: [
				...unreadable,
				...result.skipped.map((entry) => ComplianceFileNote.create({ path: entry.path, reason: entry.reason })),
			],
			parseErrors: result.parseErrors.map((entry) => ComplianceFileNote.create({ path: entry.path, reason: entry.reason })),
			error: "",
		})
	} catch (error) {
		const message = error instanceof ComplianceApiError ? error.message : ((error as Error)?.message ?? String(error))
		return ComplianceCheckResponse.create({ error: message, skipped: unreadable })
	}
}
