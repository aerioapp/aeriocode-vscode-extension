import { expect } from "chai"
import * as vscode from "vscode"
import type { ComplianceFinding } from "../ComplianceClient"
import { raiseDeviation } from "../raiseDeviationCommand"

/**
 * The two ways into raising a deviation, and the one difference between them.
 *
 * From the palette the user has not said which violation they mean, so the flow opens on the finding
 * picker. From the lightbulb they have — they clicked it on one specific squiggle — and asking again
 * would both waste a step and offer them a list containing findings they did not point at.
 */

function finding(overrides: Partial<ComplianceFinding> = {}): ComplianceFinding {
	return {
		standard: "aerio-scs",
		ruleId: "CTRL-1",
		severity: "mandatory",
		mandatory: true,
		file: "demo.cpp",
		line: 15,
		column: 1,
		endLine: 15,
		endColumn: 12,
		message: "This uses goto.",
		confidence: "high",
		fixable: null,
		fingerprint: "a".repeat(64),
		rule: { summary: null, rationale: null, exception: null, section: null },
		...overrides,
	} as ComplianceFinding
}

/** Records the placeHolder of every quick pick shown, then cancels it. */
function recordPrompts(): { placeholders: string[]; restore: () => void } {
	const placeholders: string[] = []
	const originalPick = vscode.window.showQuickPick
	const originalInput = vscode.window.showInputBox

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	;(vscode.window as any).showQuickPick = async (_items: unknown, options?: { placeHolder?: string }) => {
		placeholders.push(options?.placeHolder ?? "")
		return undefined // cancel, so the flow stops at the first prompt it reaches
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	;(vscode.window as any).showInputBox = async () => undefined

	return {
		placeholders,
		restore: () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(vscode.window as any).showQuickPick = originalPick
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(vscode.window as any).showInputBox = originalInput
		},
	}
}

describe("raising a deviation", () => {
	it("asks which violation when invoked without one", async () => {
		const prompts = recordPrompts()
		try {
			await raiseDeviation({ findings: [finding(), finding({ ruleId: "MEM-3", line: 35 })], projectKey: "proj_1" })
			expect(prompts.placeholders[0]).to.contain("Which violation")
		} finally {
			prompts.restore()
		}
	})

	it("opens on the scope question when the lightbulb supplied the violation", async () => {
		const prompts = recordPrompts()
		try {
			await raiseDeviation({
				findings: [finding(), finding({ ruleId: "MEM-3", line: 35 })],
				finding: finding({ ruleId: "MEM-3", line: 35 }),
				projectKey: "proj_1",
			})
			expect(prompts.placeholders[0]).to.contain("How much should this deviation cover")
		} finally {
			prompts.restore()
		}
	})

	it("proceeds on a preselected finding even when nothing was published for the file", async () => {
		// The lightbulb only appears on a published finding, so this cannot happen from the UI. It is
		// pinned because the guard it bypasses is about the picker having something to list, and
		// applying that guard to a caller who already named a finding would reject a valid request.
		const prompts = recordPrompts()
		try {
			await raiseDeviation({ findings: [], finding: finding(), projectKey: "proj_1" })
			expect(prompts.placeholders[0]).to.contain("How much should this deviation cover")
		} finally {
			prompts.restore()
		}
	})

	it("does nothing without a certification project", async () => {
		const prompts = recordPrompts()
		try {
			const result = await raiseDeviation({ findings: [finding()], finding: finding(), projectKey: null })
			expect(result).to.equal(null)
			expect(prompts.placeholders).to.have.length(0)
		} finally {
			prompts.restore()
		}
	})
})
