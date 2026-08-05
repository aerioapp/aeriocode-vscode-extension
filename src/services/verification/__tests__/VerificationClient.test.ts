import { describe, it } from "mocha"
import { expect } from "chai"
import { VerificationApiError, VerificationClient, type VerificationTransport } from "../VerificationClient"

/**
 * The client for the five backend services that had no client at all.
 *
 * Structural coverage, ReqIF traceability, test generation, DO-178C document drafts and the DO-330
 * qualification kit all shipped complete and reachable only over REST. A user with the extension
 * installed could not get to any of them.
 *
 * Three properties this suite is responsible for.
 *
 * **The right endpoint, with the right body.** A verification tool sending a coverage trace to the
 * requirements endpoint would fail loudly; one sending the *wrong build id* would not, and would
 * attribute coverage to the wrong lines. Every route and payload is pinned.
 *
 * **A failure is a message a person can act on.** "You are signed out", "that service is not
 * configured on this deployment", "the request timed out" are three different remedies. Collapsing
 * them into "request failed" makes the panel useless at exactly the moment somebody needs it.
 *
 * **Nothing here interprets a result.** The client passes the backend's own statements through
 * untouched — that a trace whose evidence was dropped is not-determinable, that endpoints-covered
 * is not proof of a flow, that a document draft is not submittable. Softening any of those in
 * transit would be the tool overstating itself on the way to the screen.
 */

class RecordingTransport implements VerificationTransport {
	readonly posts: Array<{ url: string; body: unknown; token: string }> = []
	readonly gets: Array<{ url: string; token: string }> = []

	private readonly response: unknown
	private readonly failure: unknown

	constructor(response: unknown, failure?: unknown) {
		this.response = response
		this.failure = failure
	}

	async post<T>(url: string, body: unknown, token: string): Promise<T> {
		this.posts.push({ url, body, token })
		if (this.failure) {
			throw this.failure
		}
		return this.response as T
	}

	async get<T>(url: string, token: string): Promise<T> {
		this.gets.push({ url, token })
		if (this.failure) {
			throw this.failure
		}
		return this.response as T
	}
}

const BASE = "https://api.test.invalid"
const token = async () => "test-token"

function clientWith(response: unknown, failure?: unknown): { client: VerificationClient; transport: RecordingTransport } {
	const transport = new RecordingTransport(response, failure)
	return { client: new VerificationClient(transport, BASE, token), transport }
}

const ok = (data: unknown) => ({ success: true, data })

describe("VerificationClient", () => {
	describe("coverage", () => {
		it("instruments through the coverage route and returns the runtime with the instrumented source", async () => {
			const { client, transport } = clientWith(
				ok({
					buildId: "abc123",
					files: [{ path: "a.c", content: "instrumented" }],
					skipped: [],
					runtime: [
						{ path: "aerio_coverage.h", content: "header" },
						{ path: "aerio_coverage.c", content: "source" },
					],
					storage: { total: 100, statementBytes: 4, vectorBytes: 48, vectorsPerDecision: 16, decisionsWithoutMcdc: 0 },
					counts: { files: 1, statements: 8, decisions: 2, conditions: 3, decisionsNotInstrumentedForMcdc: 0 },
					note: "The coverage map is retained by Aerio",
					integration: ["Add aerio_coverage.c to your build."],
				}),
			)

			const result = await client.instrument([{ path: "a.c", content: "int a;" }])

			expect(transport.posts[0].url).to.equal(`${BASE}/api/v1/coverage/instrument`)
			expect(result.buildId).to.equal("abc123")
			// Both files: the header declares the arrays extern and the source defines them once. A
			// client returning only the header would leave every translation unit counting into its
			// own copy, and the report would show the rest of the program as untested.
			expect(result.runtime).to.have.length(2)
		})

		it("sends the build id and the trace to the analysis route", async () => {
			const { client, transport } = clientWith(
				ok({
					buildId: "abc123",
					analysedAt: "now",
					method: { mcdcForms: ["unique-cause", "masking"], statement: "both forms", traceFormatVersion: 1 },
					testBasis: { requirementsBasedOnly: true, statement: "requirements-based" },
					statement: { total: 10, covered: 8, percentage: 80, uncovered: [] },
					decision: { total: 4, satisfied: 3, notDeterminable: 1, percentage: 100 },
					mcdc: {
						uniqueCause: {
							form: "unique-cause",
							total: 4,
							satisfied: 1,
							notDeterminable: 1,
							percentage: 33.3,
							conditionsTotal: 6,
							conditionsSatisfied: 2,
						},
						masking: {
							form: "masking",
							total: 4,
							satisfied: 3,
							notDeterminable: 1,
							percentage: 100,
							conditionsTotal: 6,
							conditionsSatisfied: 6,
						},
					},
					limits: ["Source-to-object-code traceability is out of scope."],
				}),
			)

			const result = await client.analyseCoverage("abc123", "QUVSTw==", { requirementsBasedOnly: true })
			const body = transport.posts[0].body as Record<string, unknown>

			expect(transport.posts[0].url).to.equal(`${BASE}/api/v1/coverage/analyze`)
			expect(body.buildId).to.equal("abc123")
			expect(body.trace).to.equal("QUVSTw==")
			// Both forms come back and neither is collapsed into one figure. For the left operand of
			// a short-circuiting operator no unique-cause pair can exist, so a client reporting that
			// form alone would state an unachievable obligation.
			expect(result.mcdc.uniqueCause.satisfied).to.equal(1)
			expect(result.mcdc.masking.satisfied).to.equal(3)
		})

		it("carries an unstated test basis as null rather than as false", async () => {
			// "The submitter did not say" and "the submitter said no" are different claims, and
			// DO-178C 6.4.4.2 turns on which one it is.
			const { client, transport } = clientWith(
				ok({ statement: {}, decision: {}, mcdc: {}, method: {}, testBasis: {}, limits: [] }),
			)

			await client.analyseCoverage("abc", "QQ==")
			expect((transport.posts[0].body as Record<string, unknown>).requirementsBasedOnly).to.equal(null)
		})
	})

	describe("requirements", () => {
		it("posts the ReqIF document to the import route", async () => {
			const { client, transport } = clientWith(
				ok({
					requirements: [
						{
							requirementId: "HLR-1",
							title: "T",
							description: "D",
							rationale: null,
							status: null,
							type: null,
							parentRequirementId: null,
						},
					],
					warnings: [],
					counts: { specObjects: 1, imported: 1, skipped: 0, withParent: 0, attributeDefinitions: 3 },
					sourceDigest: "f".repeat(64),
				}),
			)

			const result = await client.importReqIf("<REQ-IF/>")

			expect(transport.posts[0].url).to.equal(`${BASE}/api/v1/requirements/import`)
			expect(result.counts.imported).to.equal(1)
			// The digest is what lets an import be traced back to the file it came from.
			expect(result.sourceDigest).to.have.length(64)
		})

		it("builds the matrix over the supplied baseline and files", async () => {
			const { client, transport } = clientWith(
				ok({
					generatedAt: "now",
					idPatterns: { used: [], rejected: [], statement: "" },
					counts: {
						requirements: 1,
						implemented: 1,
						verified: 0,
						implementedAndVerified: 0,
						derived: 0,
						withQualityQuestions: 0,
						orphanedTags: 0,
						filesWithNoTag: 2,
					},
					rows: [],
					reverse: { orphanedTags: [], filesWithNoTag: [], statement: "untagged, not unintended" },
					derivedRequirements: { requirements: [], unlinkedOfUnknownLevel: [], statement: "safety assessment" },
					limits: [],
				}),
			)

			const matrix = await client.buildMatrix({
				requirements: [{ requirementId: "HLR-1" }],
				files: [{ path: "a.c", content: "// HLR-1" }],
			})

			expect(transport.posts[0].url).to.equal(`${BASE}/api/v1/requirements/matrix`)
			// The sentence that stops "untagged" being read as "unintended functionality" survives
			// the trip. Aerio cannot tell code that implements nothing from code nobody annotated.
			expect(matrix.reverse.statement).to.contain("untagged")
		})
	})

	describe("certification artifacts", () => {
		it("asks for a document by id and does not unwrap the Markdown rendering", async () => {
			const { client, transport } = clientWith("# PSAC\n\n**TO BE SUPPLIED BY THE APPLICANT**")

			const markdown = await client.renderDocumentMarkdown("PSAC", {})

			expect(transport.posts[0].url).to.equal(`${BASE}/api/v1/certification/documents/PSAC`)
			expect((transport.posts[0].body as Record<string, unknown>).format).to.equal("markdown")
			// The applicant marker has to survive the rendering, which is the point of having one.
			expect(markdown).to.contain("TO BE SUPPLIED BY THE APPLICANT")
		})

		it("fetches the qualification position without any project data", async () => {
			// A customer asks this before they have a project at all.
			const { client, transport } = clientWith(
				ok({
					documentType: "Tool Qualification Data",
					documentRef: "DO-330",
					generatedAt: "now",
					tool: { name: "Aerio", version: null, engineFingerprint: null },
					position: {
						criteria: 3,
						tql: 5,
						basis: "supplements review",
						whyNotCriteria1: "TQL-1 at DAL A",
						applicantObligation: "per-project",
					},
					toolOperationalRequirements: [],
					summary: { requirements: 0, verified: 0, failed: 0, notVerified: 0, statement: "" },
				}),
			)

			const kit = await client.qualificationPosition()

			expect(transport.gets[0].url).to.equal(`${BASE}/api/v1/certification/qualification`)
			expect(kit.position.criteria).to.equal(3)
			expect(kit.position.tql).to.equal(5)
		})
	})

	describe("failures are messages a person can act on", () => {
		it("says the session expired on a 401", async () => {
			const { client } = clientWith(null, { response: { status: 401 } })
			try {
				await client.qualificationPosition()
				expect.fail("should have thrown")
			} catch (error) {
				expect((error as VerificationApiError).message).to.contain("session has expired")
				expect((error as VerificationApiError).status).to.equal(401)
			}
		})

		it("passes a 503 through with the backend's own explanation", async () => {
			// The backend answers 503 rather than crashing when a service it needs is not configured
			// on that deployment, and the message says which one. Replacing it with a generic string
			// would leave an operator with nothing to act on.
			const { client } = clientWith(null, {
				response: {
					status: 503,
					data: { message: "Coverage analysis needs the database, which is not configured on this deployment." },
				},
			})
			try {
				await client.instrument([{ path: "a.c", content: "int a;" }])
				expect.fail("should have thrown")
			} catch (error) {
				expect((error as VerificationApiError).message).to.contain("not configured on this deployment")
			}
		})

		it("distinguishes a timeout from an unreachable backend", async () => {
			const timeout = clientWith(null, { code: "ECONNABORTED" })
			const refused = clientWith(null, { code: "ECONNREFUSED" })

			try {
				await timeout.client.importReqIf("<REQ-IF/>")
				expect.fail("should have thrown")
			} catch (error) {
				expect((error as Error).message).to.contain("timed out")
			}
			try {
				await refused.client.importReqIf("<REQ-IF/>")
				expect.fail("should have thrown")
			} catch (error) {
				expect((error as Error).message).to.contain("Could not reach Aerio")
			}
		})

		it("refuses to send anything when there is no signed-in account", async () => {
			const transport = new RecordingTransport(ok({}))
			const client = new VerificationClient(transport, BASE, async () => null)

			try {
				await client.instrument([{ path: "a.c", content: "int a;" }])
				expect.fail("should have thrown")
			} catch (error) {
				expect((error as Error).message).to.contain("signed in")
			}
			// And nothing left the machine.
			expect(transport.posts).to.have.length(0)
		})

		it("rejects an envelope that does not carry data rather than returning undefined", async () => {
			const { client } = clientWith({ success: false, message: 'Unknown document "NOPE"' })
			try {
				await client.generateDocument("NOPE", {})
				expect.fail("should have thrown")
			} catch (error) {
				expect((error as Error).message).to.contain("Unknown document")
			}
		})
	})
})
