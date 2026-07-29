import * as path from "path"
import * as vscode from "vscode"
import { Controller } from ".."
import {
	ApplyComplianceFixesRequest,
	ApplyComplianceFixesResponse,
	ComplianceFixedFile,
} from "@shared/proto/aeriocode/compliance"
import { ComplianceApiError, ComplianceClient, type ComplianceFile } from "@/services/compliance/ComplianceClient"
import { AeriocodeIgnoreController } from "@/core/ignore/AeriocodeIgnoreController"
import { extractTextFromFile } from "@integrations/misc/extract-text"
import { getWorkspacePath } from "@/utils/path"
import { telemetryService } from "@/services/telemetry"

/**
 * Produce fixes for the selected files and write them to disk.
 *
 * Writing is the point of difference from the AI tool path, which only ever returns a
 * diff. Here the user has clicked a button that says it will edit their files, so the
 * click is the approval — but the write still goes through a WorkspaceEdit so it lands in
 * the undo stack and in any open editor rather than behind the editor's back.
 */
export async function applyComplianceFixes(
	_controller: Controller,
	request: ApplyComplianceFixesRequest,
): Promise<ApplyComplianceFixesResponse> {
	if (!request.standard) {
		return ApplyComplianceFixesResponse.create({ error: "No compliance standard was selected." })
	}
	if (request.paths.length === 0) {
		return ApplyComplianceFixesResponse.create({ error: "Select at least one file to fix." })
	}

	const tier = request.tier === "review" ? "review" : "safe"

	const workspacePath = await getWorkspacePath()
	if (!workspacePath) {
		return ApplyComplianceFixesResponse.create({ error: "No workspace folder is open." })
	}

	const ignoreController = new AeriocodeIgnoreController(workspacePath)
	await ignoreController.initialize()

	const files: ComplianceFile[] = []
	const absoluteByPath = new Map<string, string>()

	for (const relativePath of request.paths) {
		if (!ignoreController.validateAccess(relativePath)) {
			continue
		}
		const absolutePath = path.resolve(workspacePath, relativePath)
		try {
			files.push({ path: relativePath, content: await extractTextFromFile(absolutePath) })
			absoluteByPath.set(relativePath, absolutePath)
		} catch {
			// Reported by the analysis path; skip silently here rather than fail the batch.
		}
	}

	if (files.length === 0) {
		return ApplyComplianceFixesResponse.create({ error: "None of the selected files could be read." })
	}

	try {
		const result = await ComplianceClient.getInstance().autofix(
			request.standard,
			files,
			tier,
			request.ruleIds.length > 0 ? request.ruleIds : undefined,
		)

		const edit = new vscode.WorkspaceEdit()
		const written: ComplianceFixedFile[] = []

		for (const file of result.files) {
			const absolutePath = absoluteByPath.get(file.file)
			if (!absolutePath || !file.changed) {
				written.push(ComplianceFixedFile.create({ path: file.file, changed: false, fixesApplied: 0, appliedRuleIds: [] }))
				continue
			}

			const uri = vscode.Uri.file(absolutePath)
			const document = await vscode.workspace.openTextDocument(uri)
			const whole = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
			edit.replace(uri, whole, file.fixed)

			written.push(
				ComplianceFixedFile.create({
					path: file.file,
					changed: true,
					fixesApplied: file.applied.length,
					appliedRuleIds: [...new Set(file.applied.map((entry) => entry.ruleId))],
				}),
			)
		}

		// Deliberately not the host bridge's file-write path: applyEdit puts the change in
		// the editor's undo stack, so a user who dislikes the result can press Ctrl+Z. A
		// direct write would edit the file behind any open editor's back.
		// eslint-disable-next-line eslint-rules/no-direct-vscode-api
		const applied = await vscode.workspace.applyEdit(edit)
		if (!applied) {
			return ApplyComplianceFixesResponse.create({ error: "The workspace rejected the edit; no files were changed." })
		}

		// Persist, so the result survives a reload and a subsequent re-check reads the
		// fixed text rather than the original.
		for (const file of written.filter((entry) => entry.changed)) {
			const absolutePath = absoluteByPath.get(file.path)
			if (absolutePath) {
				await (await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath))).save()
			}
		}

		telemetryService.captureButtonClick("compliance_panel_autofix")

		return ApplyComplianceFixesResponse.create({
			filesChanged: result.summary.filesChanged,
			fixesApplied: result.summary.fixesApplied,
			fixesSkipped: result.summary.fixesSkipped,
			files: written,
			error: "",
		})
	} catch (error) {
		const message = error instanceof ComplianceApiError ? error.message : ((error as Error)?.message ?? String(error))
		return ApplyComplianceFixesResponse.create({ error: message })
	}
}
