import axios from "axios"
import { aeriocodeEnvConfig } from "@/config"
import { AuthService } from "@/services/auth/AuthService"

/**
 * Client for the parts of the Aerio backend that had no client at all.
 *
 * Five services shipped complete and reachable only over REST: structural coverage, ReqIF
 * traceability, requirements-based test generation, DO-178C document drafts, and the DO-330
 * qualification kit. Everything a certification programme actually buys was there and a user with
 * the extension installed could not get to any of it.
 *
 * One client rather than five, because they are one workflow. A programme instruments its source,
 * runs the instrumented build on its target, submits the trace, imports its requirements baseline,
 * builds the matrix, and generates the artifacts — in that order, with each step's output feeding
 * the next. Five clients would have made that sequence something the caller assembles.
 *
 * ## Everything of substance stays server-side
 *
 * The coverage map, the rule packs, the objective tables and the document templates are Aerio's
 * IP and this repository is public. What crosses this boundary is source going out and results
 * coming back — never the map that makes a trace interpretable, and never a rule pack.
 *
 * ## Failures are values, not exceptions, at the controller boundary
 *
 * This client throws; the controllers that call it turn a throw into an `error` field. A panel
 * needs to render "you are signed out" as a message, not as an empty result that reads as "there
 * is nothing here".
 */

/** A file as submitted for instrumentation or analysis. */
export interface VerificationFile {
	path: string
	content: string
}

// --- Coverage ------------------------------------------------------------------------------

export interface InstrumentResult {
	buildId: string
	files: VerificationFile[]
	skipped: Array<{ path: string; reason: string }>
	/** The freestanding runtime: a header and one source file. Both go into the customer's build. */
	runtime: VerificationFile[]
	storage: {
		total: number
		statementBytes: number
		vectorBytes: number
		vectorsPerDecision: number
		decisionsWithoutMcdc: number
	}
	counts: {
		files: number
		statements: number
		decisions: number
		conditions: number
		decisionsNotInstrumentedForMcdc: number
	}
	note: string
	integration: string[]
}

/** One form of MC/DC. Both are reported; neither is chosen for the applicant. */
export interface McdcFigure {
	form: string
	total: number
	satisfied: number
	notDeterminable: number
	percentage: number | null
	conditionsTotal: number
	conditionsSatisfied: number
}

export interface CoverageResult {
	buildId: string
	analysedAt: string
	method: { mcdcForms: string[]; statement: string; traceFormatVersion: number }
	testBasis: { requirementsBasedOnly: boolean | null; statement: string }
	statement: {
		total: number
		covered: number
		percentage: number | null
		uncovered: Array<{ id: number; file: string; line: number; text: string }>
	}
	decision: { total: number; satisfied: number; notDeterminable: number; percentage: number | null }
	mcdc: { uniqueCause: McdcFigure; masking: McdcFigure }
	limits: string[]
}

export interface CouplingResult {
	analysedAt: string
	functionsAnalysed: number
	controlCoupling: { total: number; endpointsCovered: number; notCovered: number; withoutTrace: number }
	dataCoupling: { total: number; endpointsCovered: number; notCovered: number; withoutTrace: number }
	interpretation: { statement: string; statuses: Record<string, string> }
	limits: string[]
}

// --- Requirements --------------------------------------------------------------------------

export interface ImportedRequirement {
	requirementId: string
	title: string | null
	description: string | null
	rationale: string | null
	status: string | null
	type: string | null
	parentRequirementId: string | null
}

export interface ReqIfImportResult {
	requirements: ImportedRequirement[]
	warnings: Array<{ internalId: string | null; reason: string }>
	counts: { specObjects: number; imported: number; skipped: number; withParent: number; attributeDefinitions: number }
	sourceDigest: string
}

export interface TraceabilityRow {
	requirementId: string
	title: string | null
	level: string | null
	parentRequirementId: string | null
	isDerived: boolean
	childCount: number
	code: Array<{ file: string; line: number; context: string }>
	tests: Array<{ id: string; name: string; result: string | null }>
	implemented: boolean
	verified: boolean
	testsPassed: boolean | null
	quality: Array<{ category: string; severity: string; phrase: string | null; question: string }>
}

export interface TraceabilityMatrix {
	generatedAt: string
	idPatterns: { used: string[]; rejected: Array<{ pattern: unknown; reason: string }>; statement: string }
	counts: {
		requirements: number
		implemented: number
		verified: number
		implementedAndVerified: number
		derived: number
		withQualityQuestions: number
		orphanedTags: number
		filesWithNoTag: number
	}
	rows: TraceabilityRow[]
	reverse: {
		orphanedTags: Array<{ requirementId: string; file: string; line: number; reason: string }>
		filesWithNoTag: string[]
		statement: string
	}
	derivedRequirements: {
		requirements: Array<{ requirementId: string; title: string | null; reason: string }>
		unlinkedOfUnknownLevel: string[]
		statement: string
	}
	limits: string[]
}

// --- Test generation -----------------------------------------------------------------------

export interface GeneratedTestCase {
	testId: string
	requirementId: string
	name: string
	basis: string
	inputs: Record<string, unknown>
	/** Always null. An expectation inferred from the implementation cannot fail. */
	expectedResult: null
	rationale: string
}

export interface TestGenerationResult {
	generatedAt: string
	counts: { cases: number; byBasis: Record<string, number> }
	cases: GeneratedTestCase[]
	skeletons?: VerificationFile[]
	basisStatement: string
	limits: string[]
}

// --- Certification artifacts ---------------------------------------------------------------

export interface DocumentSection {
	id: string
	title: string
	clause: string
	source: string
	content: unknown
	note: string | null
}

export interface GeneratedDocument {
	documentId: string
	title: string
	clause: string
	sections: DocumentSection[]
	completeness: { complete: boolean; statement: string; sectionsGenerated: number; sectionsForApplicant: number }
	seal: { contentHash: string }
}

export interface QualificationKit {
	documentType: string
	documentRef: string
	generatedAt: string
	tool: { name: string; version: string | null; engineFingerprint: string | null }
	position: { criteria: number; tql: number; basis: string; whyNotCriteria1: string; applicantObligation: string }
	toolOperationalRequirements: Array<{
		id: string
		title: string
		requirement: string
		rationale: string
		verification: {
			status: string
			casesRun: number
			casesPassed: number
			casesFailed: number
			casesSkipped: number
			reason: string | null
		}
	}>
	summary: { requirements: number; verified: number; failed: number; notVerified: number; statement: string }
}

/**
 * Minimal transport seam. Production uses axios; tests supply a stub so the unit suite never opens
 * a socket and stays green in CI where no backend exists.
 */
export interface VerificationTransport {
	post<T>(url: string, body: unknown, token: string): Promise<T>
	get<T>(url: string, token: string): Promise<T>
}

/**
 * Longer than the compliance client's minute.
 *
 * Instrumenting a whole codebase and building a traceability matrix over a full requirements
 * baseline are both order-of-magnitude larger than a save-time check, and a timeout that fires
 * mid-analysis produces a failure the user reads as a bug rather than as a limit.
 */
const REQUEST_TIMEOUT_MS = 180_000

class AxiosTransport implements VerificationTransport {
	async post<T>(url: string, body: unknown, token: string): Promise<T> {
		const response = await axios.post(url, body, {
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			timeout: REQUEST_TIMEOUT_MS,
		})
		return response.data as T
	}

	async get<T>(url: string, token: string): Promise<T> {
		const response = await axios.get(url, {
			headers: { Authorization: `Bearer ${token}` },
			timeout: REQUEST_TIMEOUT_MS,
		})
		return response.data as T
	}
}

export class VerificationApiError extends Error {
	readonly status?: number

	// Fields are assigned explicitly rather than via TypeScript parameter properties: the unit test
	// runner loads these files through Node's strip-only TypeScript mode, which rejects parameter
	// properties outright and would fail the whole suite.
	constructor(message: string, status?: number) {
		super(message)
		this.name = "VerificationApiError"
		this.status = status
	}
}

export class VerificationClient {
	private static instance: VerificationClient | undefined

	private readonly transport: VerificationTransport
	private readonly baseUrlOverride?: string
	private readonly tokenProvider?: () => Promise<string | null>

	constructor(
		transport: VerificationTransport = new AxiosTransport(),
		baseUrlOverride?: string,
		tokenProvider?: () => Promise<string | null>,
	) {
		this.transport = transport
		this.baseUrlOverride = baseUrlOverride
		this.tokenProvider = tokenProvider
	}

	static getInstance(): VerificationClient {
		if (!VerificationClient.instance) {
			VerificationClient.instance = new VerificationClient()
		}
		return VerificationClient.instance
	}

	/** Test seam — lets a suite install a stubbed client and restore afterwards. */
	static setInstance(instance: VerificationClient | undefined): void {
		VerificationClient.instance = instance
	}

	private get apiRoot(): string {
		return `${this.baseUrlOverride ?? aeriocodeEnvConfig.apiBaseUrl}/api/v1`
	}

	private async requireToken(): Promise<string> {
		const token = this.tokenProvider ? await this.tokenProvider() : await AuthService.getInstance().getAuthToken()

		if (!token) {
			throw new VerificationApiError(
				"You must be signed in to your Aerio account to use the verification tools. Sign in from the account panel and try again.",
			)
		}
		return token
	}

	private static unwrap<T>(payload: unknown): T {
		const envelope = payload as { success?: boolean; data?: T; message?: string }
		if (envelope && envelope.success && envelope.data !== undefined) {
			return envelope.data
		}
		throw new VerificationApiError(envelope?.message ?? "Aerio returned an unexpected response")
	}

	private static describeFailure(error: unknown): never {
		if (error instanceof VerificationApiError) {
			throw error
		}

		const axiosError = error as {
			response?: { status?: number; data?: { message?: string } }
			code?: string
			message?: string
		}
		const status = axiosError.response?.status
		const serverMessage = axiosError.response?.data?.message

		if (status === 401 || status === 403) {
			throw new VerificationApiError("Your Aerio session has expired. Sign in again and retry.", status)
		}
		if (status === 402) {
			throw new VerificationApiError(serverMessage ?? "Your Aerio plan does not include the verification tools.", status)
		}
		if (status === 429) {
			throw new VerificationApiError("Too many requests. Wait a moment and try again.", status)
		}
		if (status === 503) {
			// The backend answers 503 rather than crashing when a service it needs is not configured
			// on that deployment. Passing the message through says which one.
			throw new VerificationApiError(
				serverMessage ?? "That verification service is not available on this deployment.",
				status,
			)
		}
		if (axiosError.code === "ECONNABORTED") {
			throw new VerificationApiError("The request timed out. Try a smaller scope.", status)
		}
		if (axiosError.code === "ECONNREFUSED" || axiosError.code === "ENOTFOUND") {
			throw new VerificationApiError("Could not reach Aerio. Check your connection and try again.", status)
		}

		throw new VerificationApiError(serverMessage ?? axiosError.message ?? "The verification request failed", status)
	}

	// --- Coverage ----------------------------------------------------------------------------

	/**
	 * Instrument source for structural coverage.
	 *
	 * Returns the instrumented copy and the freestanding runtime. The **coverage map stays on the
	 * server**: without it a trace is a stream of numbered probe calls, and it is what makes the
	 * whole measurement Aerio's rather than something a customer could reproduce from the output.
	 */
	async instrument(files: VerificationFile[], vectorsPerDecision?: number): Promise<InstrumentResult> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(
				`${this.apiRoot}/coverage/instrument`,
				{ files, vectorsPerDecision },
				token,
			)
			return VerificationClient.unwrap<InstrumentResult>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	/**
	 * Analyse a trace the instrumented build emitted.
	 *
	 * `requirementsBasedOnly` is the submitter's statement and is carried rather than assumed:
	 * DO-178C 6.4.4.2 asks for coverage achieved by requirements-based tests specifically, and only
	 * the applicant knows how a test was written.
	 */
	async analyseCoverage(
		buildId: string,
		traceBase64: string,
		options: { requirementsBasedOnly?: boolean | null; level?: string | null } = {},
	): Promise<CoverageResult> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(
				`${this.apiRoot}/coverage/analyze`,
				{
					buildId,
					trace: traceBase64,
					requirementsBasedOnly: options.requirementsBasedOnly ?? null,
					level: options.level ?? null,
				},
				token,
			)
			return VerificationClient.unwrap<CoverageResult>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	/** Data and control coupling — DO-178C 6.4.4.2c. Works with or without a trace. */
	async analyseCoupling(files: VerificationFile[], buildId?: string, traceBase64?: string): Promise<CouplingResult> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(
				`${this.apiRoot}/coverage/coupling`,
				{ files, buildId: buildId ?? null, trace: traceBase64 ?? null },
				token,
			)
			return VerificationClient.unwrap<CouplingResult>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	// --- Requirements ------------------------------------------------------------------------

	/**
	 * Import a ReqIF document.
	 *
	 * The neutral format DOORS, Polarion, Jama and codebeamer all speak. Without it the
	 * traceability module cannot be used on a real programme at all — requirements never originate
	 * in Aerio.
	 */
	async importReqIf(xml: string): Promise<ReqIfImportResult> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(`${this.apiRoot}/requirements/import`, { xml }, token)
			return VerificationClient.unwrap<ReqIfImportResult>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	/** Export what Aerio holds as ReqIF. States in the document that it is not a full round trip. */
	async exportReqIf(requirements: unknown[], projectName?: string): Promise<{ xml: string }> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(
				`${this.apiRoot}/requirements/export`,
				{ requirements, projectName },
				token,
			)
			return VerificationClient.unwrap<{ xml: string }>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	/** The four-way traceability matrix, in both directions. */
	async buildMatrix(input: {
		requirements: unknown[]
		files: VerificationFile[]
		tests?: unknown[]
		requirementIdPatterns?: string[] | null
	}): Promise<TraceabilityMatrix> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(`${this.apiRoot}/requirements/matrix`, input, token)
			return VerificationClient.unwrap<TraceabilityMatrix>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	// --- Test generation ---------------------------------------------------------------------

	/**
	 * Generate requirements-based test cases.
	 *
	 * The expected result is never generated. An expectation inferred from the implementation
	 * verifies that the code does what it does and cannot fail, so it is left blank and the
	 * skeleton is written not to compile until a person fills it in.
	 */
	async generateTests(input: {
		requirements: unknown[]
		signatures?: Record<string, unknown>
		typedefs?: Record<string, string>
		includeSkeletons?: boolean
	}): Promise<TestGenerationResult> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(`${this.apiRoot}/tests/generate`, input, token)
			return VerificationClient.unwrap<TestGenerationResult>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	/** Coverage attributed to requirements-based tests specifically — DO-178C 6.4.4.2. */
	async attributeCoverage(buildId: string, runs: unknown[], mcdcForm?: "masking" | "unique-cause"): Promise<unknown> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(
				`${this.apiRoot}/tests/attribute`,
				{ buildId, runs, mcdcForm },
				token,
			)
			return VerificationClient.unwrap<unknown>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	// --- Certification artifacts -------------------------------------------------------------

	/** The DO-178C life cycle document drafts. Every section Aerio cannot fill is left empty. */
	async generateDocuments(
		data: Record<string, unknown>,
		projectName?: string,
	): Promise<{ documents: GeneratedDocument[]; manifestSha256: string }> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(
				`${this.apiRoot}/certification/documents`,
				{ data, projectName },
				token,
			)
			return VerificationClient.unwrap<{ documents: GeneratedDocument[]; manifestSha256: string }>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	/** One document by id, for a panel that renders them one at a time. */
	async generateDocument(documentId: string, data: Record<string, unknown>, projectName?: string): Promise<GeneratedDocument> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.post<unknown>(
				`${this.apiRoot}/certification/documents/${encodeURIComponent(documentId)}`,
				{ data, projectName },
				token,
			)
			return VerificationClient.unwrap<GeneratedDocument>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	/**
	 * The same document rendered as Markdown, which is what a person actually works in.
	 *
	 * Returned as raw text rather than inside the usual envelope, so it is not unwrapped — the
	 * backend sets a Markdown content type and a filename, and a caller wanting the JSON shape asks
	 * for that instead. The **TO BE SUPPLIED BY THE APPLICANT** markers have to survive this
	 * rendering, which is the point of having a rendering at all.
	 */
	async renderDocumentMarkdown(documentId: string, data: Record<string, unknown>, projectName?: string): Promise<string> {
		const token = await this.requireToken()
		try {
			return await this.transport.post<string>(
				`${this.apiRoot}/certification/documents/${encodeURIComponent(documentId)}`,
				{ data, projectName, format: "markdown" },
				token,
			)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	/**
	 * Aerio's DO-330 position, which does not depend on the programme.
	 *
	 * Criteria 3 at TQL-5: the tool supplements review and eliminates nothing. Available without
	 * any project data at all, because a customer asks this question before they have any.
	 */
	async qualificationPosition(): Promise<QualificationKit> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.get<unknown>(`${this.apiRoot}/certification/qualification`, token)
			return VerificationClient.unwrap<QualificationKit>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}

	/** The Annex A objective status for an assurance level. No objective is ever reported satisfied. */
	async objectives(level: string): Promise<unknown> {
		const token = await this.requireToken()
		try {
			const payload = await this.transport.get<unknown>(
				`${this.apiRoot}/certification/objectives?level=${encodeURIComponent(level)}`,
				token,
			)
			return VerificationClient.unwrap<unknown>(payload)
		} catch (error) {
			VerificationClient.describeFailure(error)
		}
	}
}
