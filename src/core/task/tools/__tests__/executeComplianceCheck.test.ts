import { describe, it, beforeEach } from "mocha"
import { expect } from "chai"
import type { ToolUse } from "@core/assistant-message"
import type { AnalyzeResult, AutofixResult } from "@/services/compliance/ComplianceClient"
import { ComplianceApiError } from "@/services/compliance/ComplianceClient"
import { executeComplianceCheck, parseRuleIds, type ComplianceCheckHost } from "../executeComplianceCheck"

/**
 * Tests for the compliance_check dispatch path.
 *
 * This is the only place where user approval, .aeriocodeignore and backend failure meet.
 * The cases that matter are the ones where getting it wrong is silent: an autofix that
 * runs without asking, a denied request that still uploads the file, or a backend error
 * that the model reads as "compliant".
 */

interface Recorder {
	host: ComplianceCheckHost
	calls: {
		say: Array<{ type: string; text?: string; partial?: boolean }>
		ask: string[]
		approvalsRequested: string[]
		notifications: string[]
		toolResults: string[]
		missingParams: string[]
		analyze: Array<{ standard: string; contents: string[] }>
		autofix: Array<{ standard: string; tier: string; ruleIds?: string[] }>
		telemetry: Array<{ autoApproved: boolean; approved: boolean }>
		errors: Array<{ action: string; message: string }>
		checkpoints: number
		mistakes: number
		autoApprovedCount: number
	}
}

const ANALYZE_RESULT: AnalyzeResult = {
	standard: "jf-avpp",
	standardName: "JF-AV++",
	standardVersion: "2RDU00001 Rev C",
	findings: [],
	skipped: [],
	parseErrors: [],
	summary: {
		standard: "jf-avpp",
		filesAnalyzed: 1,
		totalFindings: 0,
		returnedFindings: 0,
		truncated: false,
		bySeverity: {},
		rulesViolated: 0,
		violatedRuleIds: [],
		mandatoryViolations: 0,
		mandatoryClean: true,
		coverage: {
			rulesInStandard: 231,
			rulesAutomated: 42,
			rulesManualReview: 187,
			rulesAbsentFromSource: 2,
			absentRuleIds: ["161", "172"],
		},
		score: 100,
		scoreDefinition: "share of automatically-checked rules with no violation",
	},
}

const AUTOFIX_RESULT: AutofixResult = {
	standard: "jf-avpp",
	standardName: "JF-AV++",
	tier: "safe",
	files: [
		{
			file: "a.cpp",
			changed: true,
			fixed: "void f(){ }\n",
			diff: "--- a.cpp\n+++ a.cpp\n",
			applied: [{ ruleId: "150", tier: "safe", line: 1, description: "uppercase hex" }],
			skipped: [],
		},
	],
	summary: { filesChanged: 1, fixesApplied: 1, fixesSkipped: 0, findingsBefore: 1 },
}

interface RecorderOptions {
	autoApprove?: boolean
	accessAllowed?: boolean
	fileExists?: boolean
	analyzeError?: Error
	autofixError?: Error
	approve?: boolean
}

function createRecorder(options: RecorderOptions = {}): Recorder {
	const calls: Recorder["calls"] = {
		say: [],
		ask: [],
		approvalsRequested: [],
		notifications: [],
		toolResults: [],
		missingParams: [],
		analyze: [],
		autofix: [],
		telemetry: [],
		errors: [],
		checkpoints: 0,
		mistakes: 0,
		autoApprovedCount: 0,
	}

	const host: ComplianceCheckHost = {
		cwd: "/workspace",
		say: async (type, text, _images, _files, partial) => {
			calls.say.push({ type: String(type), text, partial })
			return undefined
		},
		ask: async (type) => {
			calls.ask.push(String(type))
			return { response: "yesButtonClicked" }
		},
		askApproval: async (_block, message) => {
			calls.approvalsRequested.push(message)
			return options.approve ?? true
		},
		pushToolResult: (content) => {
			calls.toolResults.push(typeof content === "string" ? content : JSON.stringify(content))
		},
		sayAndCreateMissingParamError: async (_tool, param) => {
			calls.missingParams.push(param)
			return `missing:${param}`
		},
		removeLastPartialMessageIfExistsWithType: async () => undefined,
		removeClosingTag: (_block, _tag, text) => text ?? "",
		notifyForApproval: (message) => {
			calls.notifications.push(message)
		},
		shouldAutoApproveToolWithPath: async () => options.autoApprove ?? false,
		validateFileAccess: () => options.accessAllowed ?? true,
		incrementMistakeCount: () => {
			calls.mistakes++
		},
		resetMistakeCount: () => {
			calls.mistakes = 0
		},
		countAutoApprovedRequest: () => {
			calls.autoApprovedCount++
		},
		captureToolUsage: (autoApproved, approved) => {
			calls.telemetry.push({ autoApproved, approved })
		},
		saveCheckpoint: async () => {
			calls.checkpoints++
		},
		handleError: async (action, error) => {
			calls.errors.push({ action, message: error.message })
		},
		isLocatedInWorkspace: async () => true,
		getReadablePath: (_cwd, relPath) => relPath ?? "",
		fileExists: async () => options.fileExists ?? true,
		readFile: async () => "void f(){ }\n",
		analyze: async (standard, files) => {
			if (options.analyzeError) {
				throw options.analyzeError
			}
			calls.analyze.push({ standard, contents: files.map((file) => file.content) })
			return ANALYZE_RESULT
		},
		autofix: async (standard, _files, tier, ruleIds) => {
			if (options.autofixError) {
				throw options.autofixError
			}
			calls.autofix.push({ standard, tier, ruleIds })
			return AUTOFIX_RESULT
		},
	}

	return { host, calls }
}

function block(params: Record<string, string>, partial = false): ToolUse {
	return { type: "tool_use", name: "compliance_check", params, partial }
}

describe("executeComplianceCheck", () => {
	let recorder: Recorder

	beforeEach(() => {
		recorder = createRecorder()
	})

	describe("parameter validation", () => {
		it("reports a missing standard and does not call the backend", async () => {
			await executeComplianceCheck(block({ path: "a.cpp" }), recorder.host)

			expect(recorder.calls.missingParams).to.deep.equal(["standard"])
			expect(recorder.calls.analyze).to.have.length(0)
			expect(recorder.calls.mistakes).to.equal(1)
		})

		it("reports a missing path and does not call the backend", async () => {
			await executeComplianceCheck(block({ standard: "jf-avpp" }), recorder.host)

			expect(recorder.calls.missingParams).to.deep.equal(["path"])
			expect(recorder.calls.analyze).to.have.length(0)
		})

		it("resets the mistake counter once the parameters are valid", async () => {
			recorder = createRecorder({ autoApprove: true })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }), recorder.host)

			expect(recorder.calls.mistakes).to.equal(0)
			expect(recorder.calls.analyze).to.have.length(1)
		})
	})

	describe("partial blocks", () => {
		it("does not run an analysis while the call is still streaming", async () => {
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }, true), recorder.host)

			expect(recorder.calls.analyze).to.have.length(0)
			expect(recorder.calls.autofix).to.have.length(0)
			expect(recorder.calls.toolResults).to.have.length(0)
		})

		it("asks rather than says when the tool is not auto-approved", async () => {
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }, true), recorder.host)

			expect(recorder.calls.ask).to.deep.equal(["tool"])
			expect(recorder.calls.say).to.have.length(0)
		})

		it("says rather than asks when the tool is auto-approved", async () => {
			recorder = createRecorder({ autoApprove: true })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }, true), recorder.host)

			expect(recorder.calls.ask).to.have.length(0)
			expect(recorder.calls.say.map((entry) => entry.type)).to.deep.equal(["tool"])
		})
	})

	describe("approval gating", () => {
		it("auto-approves an analysis when the read-file policy allows it", async () => {
			recorder = createRecorder({ autoApprove: true })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }), recorder.host)

			expect(recorder.calls.approvalsRequested).to.have.length(0)
			expect(recorder.calls.autoApprovedCount).to.equal(1)
			expect(recorder.calls.telemetry).to.deep.equal([{ autoApproved: true, approved: true }])
		})

		it("never auto-approves an autofix, even when the policy would allow a read", async () => {
			// Autofix returns content the model will write back, so it is a mutation in intent
			// even though this tool writes nothing itself.
			recorder = createRecorder({ autoApprove: true })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp", mode: "autofix" }), recorder.host)

			expect(recorder.calls.approvalsRequested).to.have.length(1)
			expect(recorder.calls.autoApprovedCount).to.equal(0)
		})

		it("asks for approval on analysis when the policy does not auto-approve", async () => {
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }), recorder.host)

			expect(recorder.calls.approvalsRequested).to.have.length(1)
			expect(recorder.calls.analyze).to.have.length(1)
		})

		it("sends nothing to the backend when the user denies the request", async () => {
			recorder = createRecorder({ approve: false })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp", mode: "autofix" }), recorder.host)

			expect(recorder.calls.autofix).to.have.length(0)
			expect(recorder.calls.analyze).to.have.length(0)
			expect(recorder.calls.telemetry).to.deep.equal([{ autoApproved: false, approved: false }])
		})

		it("names the file and the mode in the approval notification", async () => {
			await executeComplianceCheck(
				block({ standard: "jf-avpp", path: "src/nested/flight.cpp", mode: "autofix" }),
				recorder.host,
			)

			expect(recorder.calls.notifications[0]).to.contain("flight.cpp")
			expect(recorder.calls.notifications[0]).to.contain("autofix")
			expect(recorder.calls.notifications[0]).to.contain("jf-avpp")
		})
	})

	describe("file access", () => {
		it("refuses a file blocked by .aeriocodeignore before any upload", async () => {
			recorder = createRecorder({ accessAllowed: false, autoApprove: true })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "secret.cpp" }), recorder.host)

			expect(recorder.calls.analyze).to.have.length(0)
			expect(recorder.calls.say.map((entry) => entry.type)).to.contain("aeriocodeignore_error")
			expect(recorder.calls.toolResults[0]).to.contain("blocked by the .aeriocodeignore")
		})

		it("reports a missing file as a tool error rather than a clean result", async () => {
			recorder = createRecorder({ fileExists: false, autoApprove: true })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "gone.cpp" }), recorder.host)

			expect(recorder.calls.analyze).to.have.length(0)
			expect(recorder.calls.toolResults[0]).to.contain("File not found: gone.cpp")
		})
	})

	describe("dispatch", () => {
		it("sends the file content to analyze in analyze mode", async () => {
			recorder = createRecorder({ autoApprove: true })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }), recorder.host)

			expect(recorder.calls.analyze).to.deep.equal([{ standard: "jf-avpp", contents: ["void f(){ }\n"] }])
			expect(recorder.calls.toolResults[0]).to.contain("JF-AV++")
		})

		it("forwards the requested tier and rule ids in autofix mode", async () => {
			await executeComplianceCheck(
				block({ standard: "jf-avpp", path: "a.cpp", mode: "autofix", tier: "review", rule_ids: "150, 14 ,126" }),
				recorder.host,
			)

			expect(recorder.calls.autofix).to.deep.equal([{ standard: "jf-avpp", tier: "review", ruleIds: ["150", "14", "126"] }])
		})

		it("defaults to the safe tier when the model names an unknown one", async () => {
			await executeComplianceCheck(
				block({ standard: "jf-avpp", path: "a.cpp", mode: "autofix", tier: "aggressive" }),
				recorder.host,
			)

			expect(recorder.calls.autofix[0].tier).to.equal("safe")
		})

		it("treats an unrecognised mode as analyze rather than guessing autofix", async () => {
			recorder = createRecorder({ autoApprove: true })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp", mode: "repair" }), recorder.host)

			expect(recorder.calls.analyze).to.have.length(1)
			expect(recorder.calls.autofix).to.have.length(0)
		})

		it("forwards an unknown standard so a new backend rule pack works without a release", async () => {
			recorder = createRecorder({ autoApprove: true })
			await executeComplianceCheck(block({ standard: "do-178c", path: "a.c" }), recorder.host)

			expect(recorder.calls.analyze[0].standard).to.equal("do-178c")
		})
	})

	describe("error handling", () => {
		it("reports a backend error as a tool error, never as a clean result", async () => {
			recorder = createRecorder({
				autoApprove: true,
				analyzeError: new ComplianceApiError("Your Aerio session is not valid", 401),
			})
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }), recorder.host)

			expect(recorder.calls.toolResults[0]).to.contain("Compliance check failed")
			expect(recorder.calls.toolResults[0]).to.contain("session is not valid")
			expect(recorder.calls.toolResults[0]).to.not.contain("compliant")
		})

		it("lists the valid standards when the requested one does not exist", async () => {
			recorder = createRecorder({
				autoApprove: true,
				analyzeError: new ComplianceApiError("Unknown standard", 404, ["jf-avpp"]),
			})
			await executeComplianceCheck(block({ standard: "misra", path: "a.cpp" }), recorder.host)

			expect(recorder.calls.toolResults[0]).to.contain("Available standards: jf-avpp.")
		})

		it("routes an unexpected error through the generic handler", async () => {
			recorder = createRecorder({ autoApprove: true, analyzeError: new Error("socket exploded") })
			await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }), recorder.host)

			expect(recorder.calls.errors).to.deep.equal([{ action: "running compliance check", message: "socket exploded" }])
		})

		it("saves a checkpoint on every terminal path", async () => {
			for (const options of [
				{ autoApprove: true },
				{ autoApprove: true, fileExists: false },
				{ autoApprove: true, analyzeError: new ComplianceApiError("nope") },
				{ autoApprove: true, analyzeError: new Error("boom") },
			]) {
				const local = createRecorder(options)
				await executeComplianceCheck(block({ standard: "jf-avpp", path: "a.cpp" }), local.host)
				expect(local.calls.checkpoints, JSON.stringify(Object.keys(options))).to.equal(1)
			}
		})
	})

	describe("parseRuleIds", () => {
		it("returns undefined when no ids are given so the backend checks every rule", () => {
			expect(parseRuleIds(undefined)).to.equal(undefined)
			expect(parseRuleIds("")).to.equal(undefined)
			expect(parseRuleIds(" , , ")).to.equal(undefined)
		})

		it("trims and drops empty entries", () => {
			expect(parseRuleIds("150, 14 , ,126")).to.deep.equal(["150", "14", "126"])
		})
	})
})
