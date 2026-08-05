import * as crypto from "crypto"
import type { ComplianceAutofixParams, ComplianceCheckParams, ComplianceFileRecord } from "@/certification/types"
import type { AnalyzeResult, AutofixResult, ComplianceFile } from "./ComplianceClient"

/**
 * Turns a compliance result into an audit record.
 *
 * This lives behind the ComplianceClient rather than at each call site on purpose. There
 * are four ways to start a run today — the model's tool call, the compliance panel, the
 * diagnostics provider and the command palette — and adding a fifth must not be able to
 * produce an unrecorded run. Recording where every path already converges makes the
 * evidence a property of the transport instead of something each caller has to remember.
 *
 * What is recorded is deliberately narrow: counts, rule ids, and a SHA-256 per file. The
 * hash ties a result to the exact bytes analyzed without the audit trail becoming a second
 * copy of the source, which matters both for size and because the trail is exportable.
 */

/**
 * Who to notify. Kept as an interface so the unit suite can assert what would have been
 * recorded without constructing a CertificationManager, which needs a live extension
 * context and a database on disk.
 */
export interface ComplianceAuditSink {
	onComplianceCheck(params: ComplianceCheckParams): Promise<void>
	onComplianceAutofix(params: ComplianceAutofixParams): Promise<void>
}

export type ComplianceTrigger = ComplianceCheckParams["trigger"]

export interface ComplianceAuditContext {
	trigger: ComplianceTrigger
	taskId?: string
	userId?: string
}

function sha256(content: string): string {
	return crypto.createHash("sha256").update(content, "utf8").digest("hex")
}

function fileRecords(files: ComplianceFile[]): ComplianceFileRecord[] {
	return files.map((file) => ({ path: file.path, content_sha256: sha256(file.content) }))
}

let sink: ComplianceAuditSink | null = null

/**
 * Install the recorder. Called once at activation with the CertificationManager, and by
 * tests with a stub. Left unset the recorder is inert, which is what keeps the compliance
 * feature working for users who never turn certification on.
 */
export function setComplianceAuditSink(next: ComplianceAuditSink | null): void {
	sink = next
}

export function getComplianceAuditSink(): ComplianceAuditSink | null {
	return sink
}

/**
 * Record an analysis.
 *
 * Never throws. A failure to write evidence must not fail the user's compliance check —
 * the finding list is still correct and still useful, and a thrown error here would turn
 * an optional feature into a way to break a working one. Failures are logged by the sink.
 */
export async function recordComplianceCheck(
	result: AnalyzeResult,
	files: ComplianceFile[],
	context: ComplianceAuditContext,
): Promise<void> {
	if (!sink || !result.provenance) {
		return
	}

	try {
		await sink.onComplianceCheck({
			provenance: result.provenance,
			standard_name: result.standardName,
			files: fileRecords(files),
			trigger: context.trigger,
			task_id: context.taskId,
			user_id: context.userId,
			violated_rule_ids: result.summary.violatedRuleIds,
			total_findings: result.summary.totalFindings,
			mandatory_violations: result.summary.mandatoryViolations,
			mandatory_clean: result.summary.mandatoryClean,
			score: result.summary.score,
			rules_automated: result.summary.coverage.rulesAutomated,
			// Recorded alongside the automated count, not folded into it. The audit trail is what a
			// certification review reads back years later, and a record saying only "111 automated"
			// cannot be told apart from one where all 111 were checked in full.
			rules_partially_automated: result.summary.coverage.rulesPartiallyAutomated ?? null,
			rules_manual_review: result.summary.coverage.rulesManualReview,
			truncated: result.summary.truncated,
		})
	} catch {
		// Sink implementations already log; swallowing here keeps a broken audit path from
		// surfacing as a failed compliance check.
	}
}

/**
 * Record an autofix.
 *
 * Both hashes are kept per file. The before hash matches the analysis record, so the fix
 * is attributable to a specific analyzed state; the after hash lets a reviewer confirm the
 * file in the repository is what the tool produced rather than something edited since.
 */
export async function recordComplianceAutofix(
	result: AutofixResult,
	files: ComplianceFile[],
	context: ComplianceAuditContext,
): Promise<void> {
	if (!sink || !result.provenance) {
		return
	}

	try {
		const submitted = new Map(files.map((file) => [file.path, file.content]))
		const appliedRuleIds = new Set<string>()
		for (const file of result.files) {
			for (const fix of file.applied) {
				appliedRuleIds.add(fix.ruleId)
			}
		}

		await sink.onComplianceAutofix({
			provenance: result.provenance,
			standard_name: result.standardName,
			tier: result.tier === "review" ? "review" : "safe",
			trigger: context.trigger,
			task_id: context.taskId,
			user_id: context.userId,
			files: result.files.map((file) => ({
				path: file.file,
				content_sha256: sha256(submitted.get(file.file) ?? ""),
				fixed_sha256: sha256(file.fixed),
				changed: file.changed,
			})),
			applied_rule_ids: [...appliedRuleIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
			fixes_applied: result.summary.fixesApplied,
			fixes_skipped: result.summary.fixesSkipped,
		})
	} catch {
		// See recordComplianceCheck.
	}
}
