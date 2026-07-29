import { describe, it } from "mocha"
import { expect } from "chai"
import { ComplianceApiError, ComplianceClient, type AnalyzeResult, type ComplianceTransport } from "../ComplianceClient"

/**
 * Unit tests for the compliance backend client.
 *
 * These run in GitHub CI where no backend exists, so every case uses a stub transport
 * and no test opens a socket. The live-backend cases are in ComplianceIntegration.test.ts
 * and skip themselves unless AERIOCODE_BACKEND_URL is set.
 */

interface RecordedCall {
	url: string
	body?: unknown
	token: string
}

class StubTransport implements ComplianceTransport {
	readonly calls: RecordedCall[] = []
	private readonly responder: (url: string, body?: unknown) => unknown

	// Explicit assignment, not a parameter property: the unit runner strips types without
	// transforming them, and parameter properties would fail to load the whole suite.
	constructor(responder: (url: string, body?: unknown) => unknown = () => ({ success: true, data: {} })) {
		this.responder = responder
	}

	async post<T>(url: string, body: unknown, token: string): Promise<T> {
		this.calls.push({ url, body, token })
		return this.responder(url, body) as T
	}

	async get<T>(url: string, token: string): Promise<T> {
		this.calls.push({ url, token })
		return this.responder(url) as T
	}
}

const BASE = "http://backend.test"
const token = async () => "session-token"

function makeAnalyzeResponse(overrides: Partial<AnalyzeResult> = {}) {
	return {
		success: true,
		data: {
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
				scoreDefinition: "Percentage of automatically-checked rules with no violation.",
			},
			...overrides,
		},
	}
}

describe("ComplianceClient", () => {
	describe("request construction", () => {
		it("posts to the standard-scoped analyze endpoint", async () => {
			const transport = new StubTransport(() => makeAnalyzeResponse())
			const client = new ComplianceClient(transport, BASE, token)

			await client.analyze("jf-avpp", [{ path: "a.cpp", content: "void f(){}" }])

			expect(transport.calls[0].url).to.equal(`${BASE}/api/v1/compliance/jf-avpp/analyze`)
			expect(transport.calls[0].token).to.equal("session-token")
			expect(transport.calls[0].body).to.deep.equal({ files: [{ path: "a.cpp", content: "void f(){}" }] })
		})

		it("forwards an arbitrary standard id without validating it locally", async () => {
			// The backend registry is the authority on which standards exist. Hardcoding a
			// list here would mean a newly registered pack needs an extension release.
			const transport = new StubTransport(() => makeAnalyzeResponse())
			const client = new ComplianceClient(transport, BASE, token)

			await client.analyze("some-future-standard", [{ path: "a.c", content: "" }])

			expect(transport.calls[0].url).to.contain("/some-future-standard/analyze")
		})

		it("defaults autofix to the safe tier", async () => {
			const transport = new StubTransport(() => ({ success: true, data: { files: [] } }))
			const client = new ComplianceClient(transport, BASE, token)

			await client.autofix("jf-avpp", [{ path: "a.cpp", content: "" }])

			expect(transport.calls[0].body).to.deep.include({ tier: "safe", ruleIds: null })
		})

		it("passes tier and ruleIds through when given", async () => {
			const transport = new StubTransport(() => ({ success: true, data: { files: [] } }))
			const client = new ComplianceClient(transport, BASE, token)

			await client.autofix("jf-avpp", [{ path: "a.cpp", content: "" }], "review", ["150", "14"])

			expect(transport.calls[0].body).to.deep.include({ tier: "review" })
			expect((transport.calls[0].body as { ruleIds: string[] }).ruleIds).to.deep.equal(["150", "14"])
		})

		it("unwraps the success envelope", async () => {
			const transport = new StubTransport(() => makeAnalyzeResponse())
			const client = new ComplianceClient(transport, BASE, token)

			const result = await client.analyze("jf-avpp", [{ path: "a.cpp", content: "" }])

			expect(result.standardName).to.equal("JF-AV++")
			expect(result.summary.coverage.rulesAutomated).to.equal(42)
		})
	})

	describe("authentication", () => {
		it("fails with a clear message when there is no token", async () => {
			const transport = new StubTransport()
			const client = new ComplianceClient(transport, BASE, async () => null)

			try {
				await client.analyze("jf-avpp", [{ path: "a.cpp", content: "" }])
				expect.fail("expected the call to reject")
			} catch (error) {
				expect(error).to.be.instanceOf(ComplianceApiError)
				expect((error as Error).message).to.match(/signed in to your Aerio account/)
			}

			// The request must never be attempted without credentials.
			expect(transport.calls).to.have.lengthOf(0)
		})
	})

	describe("error translation", () => {
		const rejectWith = (payload: unknown) =>
			new (class implements ComplianceTransport {
				async post<T>(): Promise<T> {
					throw payload
				}
				async get<T>(): Promise<T> {
					throw payload
				}
			})()

		it("explains a 401 as a session problem", async () => {
			const client = new ComplianceClient(rejectWith({ response: { status: 401 } }), BASE, token)

			try {
				await client.analyze("jf-avpp", [{ path: "a.cpp", content: "" }])
				expect.fail("expected rejection")
			} catch (error) {
				expect((error as ComplianceApiError).status).to.equal(401)
				expect((error as Error).message).to.match(/Sign in again/)
			}
		})

		it("surfaces the valid standards from a 404", async () => {
			const client = new ComplianceClient(
				rejectWith({
					response: {
						status: 404,
						data: { message: 'Unknown compliance standard "misra"', validStandards: ["jf-avpp"] },
					},
				}),
				BASE,
				token,
			)

			try {
				await client.analyze("misra", [{ path: "a.cpp", content: "" }])
				expect.fail("expected rejection")
			} catch (error) {
				expect((error as ComplianceApiError).validStandards).to.deep.equal(["jf-avpp"])
			}
		})

		it("explains a rate limit", async () => {
			const client = new ComplianceClient(rejectWith({ response: { status: 429 } }), BASE, token)

			try {
				await client.analyze("jf-avpp", [{ path: "a.cpp", content: "" }])
				expect.fail("expected rejection")
			} catch (error) {
				expect((error as Error).message).to.match(/request limit reached/i)
			}
		})

		it("explains an unreachable backend", async () => {
			const client = new ComplianceClient(rejectWith({ code: "ECONNREFUSED" }), BASE, token)

			try {
				await client.analyze("jf-avpp", [{ path: "a.cpp", content: "" }])
				expect.fail("expected rejection")
			} catch (error) {
				expect((error as Error).message).to.match(/Could not reach Aerio/)
			}
		})

		it("rejects a malformed envelope rather than returning undefined data", async () => {
			const client = new ComplianceClient(
				new StubTransport(() => ({ success: false, message: "something broke" })),
				BASE,
				token,
			)

			try {
				await client.analyze("jf-avpp", [{ path: "a.cpp", content: "" }])
				expect.fail("expected rejection")
			} catch (error) {
				expect((error as Error).message).to.equal("something broke")
			}
		})
	})

	describe("instance management", () => {
		it("supports replacing the singleton for tests and restoring it", () => {
			const original = ComplianceClient.getInstance()
			const replacement = new ComplianceClient(new StubTransport(), BASE, token)

			ComplianceClient.setInstance(replacement)
			expect(ComplianceClient.getInstance()).to.equal(replacement)

			ComplianceClient.setInstance(original)
			expect(ComplianceClient.getInstance()).to.equal(original)
		})
	})
})
