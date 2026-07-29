import * as path from "path"
import type { ToolResponse } from ".."
import type { ToolUse, ToolParamName, ToolUseName } from "../../assistant-message"
import { formatResponse } from "../../prompts/responses"
import type { AeriocodeAsk, AeriocodeSay, AeriocodeSayTool } from "@shared/ExtensionMessage"
import type { AnalyzeResult, AutofixResult, ComplianceFile } from "@/services/compliance/ComplianceClient"
import { ComplianceApiError } from "@/services/compliance/ComplianceClient"
import { formatAnalyzeResult, formatAutofixResult } from "@/services/compliance/formatComplianceResult"

/**
 * Execution of the `compliance_check` tool.
 *
 * This lives outside ToolExecutor so it can be tested. Every dependency that touches the
 * outside world — the UI, the filesystem, telemetry, the backend — arrives through
 * {@link ComplianceCheckHost}, which lets a suite assert on the parts that actually carry
 * risk: whether an autofix can slip past approval, whether a denied request still reaches
 * the network, and whether a backend failure is reported as success.
 */
export interface ComplianceCheckHost {
	cwd: string

	// UI and conversation state
	say: (type: AeriocodeSay, text?: string, images?: string[], files?: string[], partial?: boolean) => Promise<undefined>
	ask: (type: AeriocodeAsk, text?: string, partial?: boolean) => Promise<unknown>
	askApproval: (block: ToolUse, message: string) => Promise<boolean>
	pushToolResult: (content: ToolResponse, block: ToolUse) => void
	sayAndCreateMissingParamError: (toolName: ToolUseName, paramName: string) => Promise<ToolResponse>
	removeLastPartialMessageIfExistsWithType: (type: "ask" | "say", askOrSay: AeriocodeAsk | AeriocodeSay) => Promise<void>
	removeClosingTag: (block: ToolUse, tag: ToolParamName, text?: string) => string
	notifyForApproval: (message: string) => void

	// Policy. The path-aware form is the correct one for a file-reading tool: the plain
	// shouldAutoApproveTool returns a [local, external] tuple for compliance_check, and a
	// tuple is truthy even when both flags are false — testing it directly would approve
	// silently against the user's settings.
	shouldAutoApproveToolWithPath: (toolName: ToolUseName, relPath: string | undefined) => Promise<boolean>
	validateFileAccess: (relPath: string) => boolean

	// Task bookkeeping
	incrementMistakeCount: () => void
	resetMistakeCount: () => void
	countAutoApprovedRequest: () => void
	captureToolUsage: (autoApproved: boolean, approved: boolean) => void
	saveCheckpoint: () => Promise<void>
	handleError: (action: string, error: Error, block: ToolUse) => Promise<void>

	// Environment
	isLocatedInWorkspace: (relPath?: string) => Promise<boolean>
	getReadablePath: (cwd: string, relPath?: string) => string
	fileExists: (absolutePath: string) => Promise<boolean>
	readFile: (absolutePath: string) => Promise<string>

	// Backend
	analyze: (standard: string, files: ComplianceFile[]) => Promise<AnalyzeResult>
	autofix: (standard: string, files: ComplianceFile[], tier: "safe" | "review", ruleIds?: string[]) => Promise<AutofixResult>
}

/** Comma-separated rule ids from the model, normalised; `undefined` means "all rules". */
export function parseRuleIds(raw: string | undefined): string[] | undefined {
	if (!raw) {
		return undefined
	}
	const ids = raw
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean)
	return ids.length > 0 ? ids : undefined
}

export async function executeComplianceCheck(block: ToolUse, host: ComplianceCheckHost): Promise<void> {
	const standard: string | undefined = block.params.standard
	const relPath: string | undefined = block.params.path
	const mode: "analyze" | "autofix" = block.params.mode === "autofix" ? "autofix" : "analyze"
	const tier: "safe" | "review" = block.params.tier === "review" ? "review" : "safe"

	const sharedMessageProps: AeriocodeSayTool = {
		tool: "readFile",
		path: host.getReadablePath(host.cwd, host.removeClosingTag(block, "path", relPath)),
		content: `Checking ${host.removeClosingTag(block, "path", relPath)} against ${host.removeClosingTag(
			block,
			"standard",
			standard,
		)}`,
		operationIsLocatedInWorkspace: await host.isLocatedInWorkspace(relPath),
	}

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify(sharedMessageProps)
			if (await host.shouldAutoApproveToolWithPath("compliance_check", relPath)) {
				await host.removeLastPartialMessageIfExistsWithType("ask", "tool")
				await host.say("tool", partialMessage, undefined, undefined, block.partial)
			} else {
				await host.removeLastPartialMessageIfExistsWithType("say", "tool")
				await Promise.resolve(host.ask("tool", partialMessage, block.partial)).catch(() => {})
			}
			return
		}

		if (!standard) {
			host.incrementMistakeCount()
			host.pushToolResult(await host.sayAndCreateMissingParamError("compliance_check", "standard"), block)
			await host.saveCheckpoint()
			return
		}
		if (!relPath) {
			host.incrementMistakeCount()
			host.pushToolResult(await host.sayAndCreateMissingParamError("compliance_check", "path"), block)
			await host.saveCheckpoint()
			return
		}

		if (!host.validateFileAccess(relPath)) {
			await host.say("aeriocodeignore_error", relPath)
			host.pushToolResult(formatResponse.toolError(formatResponse.aeriocodeIgnoreError(relPath)), block)
			await host.saveCheckpoint()
			return
		}

		host.resetMistakeCount()

		const completeMessage = JSON.stringify(sharedMessageProps)

		// Analysis only reads the file, so it can be auto-approved on the same terms as
		// read_file — including the workspace-external distinction. Autofix is a different
		// matter: it produces content the model will write back, so the user is always asked
		// first regardless of the auto-approval settings.
		const autoApprovable = mode === "analyze" && (await host.shouldAutoApproveToolWithPath("compliance_check", relPath))

		if (autoApprovable) {
			await host.removeLastPartialMessageIfExistsWithType("ask", "tool")
			await host.say("tool", completeMessage, undefined, undefined, false)
			host.countAutoApprovedRequest()
			host.captureToolUsage(true, true)
		} else {
			host.notifyForApproval(`Aeriocode wants to run a ${standard} compliance ${mode} on ${path.basename(relPath)}`)
			await host.removeLastPartialMessageIfExistsWithType("say", "tool")
			const didApprove = await host.askApproval(block, completeMessage)
			if (!didApprove) {
				host.captureToolUsage(false, false)
				await host.saveCheckpoint()
				return
			}
			host.captureToolUsage(false, true)
		}

		const absolutePath = path.resolve(host.cwd, relPath)
		if (!(await host.fileExists(absolutePath))) {
			host.pushToolResult(
				formatResponse.toolError(
					`File not found: ${relPath}. Check the path is correct and relative to the working directory.`,
				),
				block,
			)
			await host.saveCheckpoint()
			return
		}

		const content = await host.readFile(absolutePath)
		const files: ComplianceFile[] = [{ path: relPath, content }]

		if (mode === "autofix") {
			const result = await host.autofix(standard, files, tier, parseRuleIds(block.params.rule_ids))
			host.pushToolResult(formatResponse.toolResult(formatAutofixResult(result)), block)
		} else {
			const result = await host.analyze(standard, files)
			host.pushToolResult(formatResponse.toolResult(formatAnalyzeResult(result)), block)
		}

		await host.saveCheckpoint()
	} catch (error) {
		// A compliance failure must not read as "the code is compliant". Surface it as a tool
		// error so the model reports the failure rather than moving on.
		if (error instanceof ComplianceApiError) {
			host.pushToolResult(
				formatResponse.toolError(
					`Compliance check failed: ${error.message}` +
						(error.validStandards ? ` Available standards: ${error.validStandards.join(", ")}.` : ""),
				),
				block,
			)
			await host.saveCheckpoint()
			return
		}
		await host.handleError("running compliance check", error as Error, block)
		await host.saveCheckpoint()
	}
}
