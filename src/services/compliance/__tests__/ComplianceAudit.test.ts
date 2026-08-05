import { describe, it, afterEach } from "mocha"
import { expect } from "chai"
import * as crypto from "crypto"
import type { ComplianceAutofixParams, ComplianceCheckParams } from "@/certification/types"
import {
	type ComplianceAuditSink,
	recordComplianceAutofix,
	recordComplianceCheck,
	setComplianceAuditSink,
} from "../ComplianceAudit"
import type { AnalyzeResult, AutofixResult } from "../ComplianceClient"

/**
 * A compliance run is a verification activity and its result is evidence. These tests
 * pin the two properties that make the record usable as evidence — it identifies the
 * exact source analyzed, and it never contains that source — plus the property that keeps
 * it safe to have at all: a failure to record must not fail the user's compliance check.
 */

class RecordingSink implements ComplianceAuditSink {
	readonly checks: ComplianceCheckParams[] = []
	readonly autofixes: ComplianceAutofixParams[] = []
	private readonly explode: boolean

	constructor(explode = false) {
		this.explode = explode
	}

	async onComplianceCheck(params: ComplianceCheckParams): Promise<void> {
		if (this.explode) {
			throw new Error("audit database is unavailable")
		}
		this.checks.push(params)
	}

	async onComplianceAutofix(params: ComplianceAutofixParams): Promise<void> {
		if (this.explode) {
			throw new Error("audit database is unavailable")
		}
		this.autofixes.push(params)
	}
}

const PROVENANCE = {
	engineVersion: "1.1.0",
	engineFingerprint: "a".repeat(64),
	standard: "jf-avpp",
	standardVersion: "2RDU00001 Rev C",
	catalogHash: "b".repeat(64),
}

const SOURCE = "void f(){ goto e; e: ; }"
const SOURCE_SHA = crypto.createHash("sha256").update(SOURCE, "utf8").digest("hex")

function analyzeResult(overrides: Partial<AnalyzeResult> = {}): AnalyzeResult {
	return {
		standard: "jf-avpp",
		standardName: "JF-AV++",
		standardVersion: "2RDU00001 Rev C",
		provenance: PROVENANCE,
		findings: [],
		skipped: [],
		parseErrors: [],
		summary: {
			standard: "jf-avpp",
			filesAnalyzed: 1,
			totalFindings: 3,
			returnedFindings: 3,
			truncated: false,
			bySeverity: {},
			rulesViolated: 2,
			violatedRuleIds: ["188", "189"],
			mandatoryViolations: 3,
			mandatoryClean: false,
			coverage: {
				rulesInStandard: 231,
				rulesAutomated: 42,
				rulesManualReview: 187,
				rulesAbsentFromSource: 2,
				absentRuleIds: ["161", "172"],
			},
			score: 95.2,
			scoreDefinition: "…",
		},
		...overrides,
	}
}

function autofixResult(overrides: Partial<AutofixResult> = {}): AutofixResult {
	return {
		standard: "jf-avpp",
		standardName: "JF-AV++",
		provenance: PROVENANCE,
		tier: "safe",
		files: [
			{
				file: "a.cpp",
				changed: true,
				fixed: "void f(){ return; }",
				diff: "…",
				applied: [{ ruleId: "59", tier: "safe", line: 1, description: "added braces" }],
				skipped: [],
			},
		],
		summary: { filesChanged: 1, fixesApplied: 1, fixesSkipped: 0, findingsBefore: 3 },
		...overrides,
	}
}

describe("ComplianceAudit", () => {
	afterEach(() => setComplianceAuditSink(null))

	it("records the run without recording the source", async () => {
		const sink = new RecordingSink()
		setComplianceAuditSink(sink)

		await recordComplianceCheck(analyzeResult(), [{ path: "a.cpp", content: SOURCE }], { trigger: "tool" })

		expect(sink.checks).to.have.length(1)
		const [record] = sink.checks
		expect(record.files).to.deep.equal([{ path: "a.cpp", content_sha256: SOURCE_SHA }])

		// The whole record is serialized into the audit payload, so the source must not
		// appear anywhere in it — not just in the field it would obviously go in.
		expect(JSON.stringify(record)).to.not.include("goto")
	})

	it("carries the provenance and coverage a report has to state", async () => {
		const sink = new RecordingSink()
		setComplianceAuditSink(sink)

		await recordComplianceCheck(analyzeResult(), [{ path: "a.cpp", content: SOURCE }], { trigger: "tool" })

		const [record] = sink.checks
		expect(record.provenance).to.deep.equal(PROVENANCE)
		expect(record.violated_rule_ids).to.deep.equal(["188", "189"])
		expect(record.mandatory_clean).to.be.false
		// Without the denominator, "no findings" reads as "compliant".
		expect(record.rules_automated).to.equal(42)
		expect(record.rules_manual_review).to.equal(187)
		// Null, not zero: this fixture's backend does not report the field, and a record saying
		// zero would claim all 42 were checked in full. The audit trail is read back years later
		// by somebody who cannot ask which it meant.
		expect(record.rules_partially_automated).to.be.null
	})

	it("records how many of the checked rules were checked only in part", async () => {
		const sink = new RecordingSink()
		setComplianceAuditSink(sink)

		const result = analyzeResult()
		await recordComplianceCheck(
			{
				...result,
				summary: { ...result.summary, coverage: { ...result.summary.coverage, rulesPartiallyAutomated: 9 } },
			},
			[{ path: "a.cpp", content: SOURCE }],
			{ trigger: "tool" },
		)

		expect(sink.checks[0].rules_partially_automated).to.equal(9)
	})

	it("attributes the run to how it was started", async () => {
		const sink = new RecordingSink()
		setComplianceAuditSink(sink)

		await recordComplianceCheck(analyzeResult(), [{ path: "a.cpp", content: SOURCE }], {
			trigger: "tool",
			taskId: "task-42",
		})

		expect(sink.checks[0].trigger).to.equal("tool")
		expect(sink.checks[0].task_id).to.equal("task-42")
	})

	it("keeps both hashes for a fix so the change is attributable", async () => {
		const sink = new RecordingSink()
		setComplianceAuditSink(sink)

		await recordComplianceAutofix(autofixResult(), [{ path: "a.cpp", content: SOURCE }], { trigger: "panel" })

		const [record] = sink.autofixes
		expect(record.files[0].content_sha256).to.equal(SOURCE_SHA)
		expect(record.files[0].fixed_sha256).to.equal(
			crypto.createHash("sha256").update("void f(){ return; }", "utf8").digest("hex"),
		)
		expect(record.files[0].fixed_sha256).to.not.equal(record.files[0].content_sha256)
		expect(record.applied_rule_ids).to.deep.equal(["59"])
		expect(JSON.stringify(record)).to.not.include("goto")
	})

	it("does not record a result that carries no provenance", async () => {
		// An older backend cannot identify what produced the result, and a record that
		// cannot say which engine and rule set it came from is not evidence.
		const sink = new RecordingSink()
		setComplianceAuditSink(sink)

		await recordComplianceCheck(analyzeResult({ provenance: undefined }), [{ path: "a.cpp", content: SOURCE }], {
			trigger: "tool",
		})

		expect(sink.checks).to.be.empty
	})

	it("is inert when no sink is installed", async () => {
		setComplianceAuditSink(null)
		// Certification is optional; compliance has to work without it.
		await recordComplianceCheck(analyzeResult(), [{ path: "a.cpp", content: SOURCE }], { trigger: "command" })
	})

	it("never lets a failed recording fail the compliance run", async () => {
		setComplianceAuditSink(new RecordingSink(true))

		// A broken audit path must not turn a working feature into a failing one.
		await recordComplianceCheck(analyzeResult(), [{ path: "a.cpp", content: SOURCE }], { trigger: "tool" })
		await recordComplianceAutofix(autofixResult(), [{ path: "a.cpp", content: SOURCE }], { trigger: "tool" })
	})
})
