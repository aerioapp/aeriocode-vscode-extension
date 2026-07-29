import axios from "axios"
import { aeriocodeEnvConfig } from "@/config"
import { AuthService } from "@/services/auth/AuthService"

/**
 * Client for the Aeriocode backend compliance API.
 *
 * The analysis engine and rule packs live entirely in the backend; this client is
 * deliberately standard-agnostic. It forwards whatever `standard` id it is given and
 * renders whatever the backend returns, so a newly registered rule pack becomes
 * usable without shipping a new extension version.
 */

export interface ComplianceFinding {
	standard: string
	ruleId: string
	severity: string
	mandatory: boolean
	file: string
	line: number
	column: number
	endLine: number
	endColumn: number
	message: string
	confidence: "high" | "medium" | "low"
	fixable: "safe" | "review" | null
	rule: {
		statement: string | null
		rationale: string | null
		exception: string | null
		section: string | null
	}
	evidence?: Record<string, unknown> | null
}

export interface ComplianceSummary {
	standard: string
	filesAnalyzed: number
	/** Violations found. Not necessarily the number returned — see `truncated`. */
	totalFindings: number
	/** Violations actually included in `findings`. */
	returnedFindings: number
	/** True when the backend capped the finding list to bound the response size. */
	truncated: boolean
	bySeverity: Record<string, number>
	rulesViolated: number
	violatedRuleIds: string[]
	mandatoryViolations: number
	mandatoryClean: boolean
	coverage: {
		rulesInStandard: number
		rulesAutomated: number
		rulesManualReview: number
		rulesAbsentFromSource: number
		absentRuleIds: string[]
	}
	score: number | null
	scoreDefinition: string
}

export interface AnalyzeResult {
	standard: string
	standardName: string
	standardVersion: string
	findings: ComplianceFinding[]
	skipped: Array<{ path: string; reason: string }>
	parseErrors: Array<{ path: string; reason: string }>
	summary: ComplianceSummary
}

export interface AutofixFileResult {
	file: string
	changed: boolean
	fixed: string
	diff: string
	applied: Array<{ ruleId: string; tier: string; line: number; description: string }>
	skipped: Array<{ ruleId: string; line: number; reason: string }>
}

export interface AutofixResult {
	standard: string
	standardName: string
	tier: string
	files: AutofixFileResult[]
	summary: {
		filesChanged: number
		fixesApplied: number
		fixesSkipped: number
		findingsBefore: number
	}
}

export interface StandardDescriptor {
	id: string
	name: string
	title: string
	version: string
	languages: string[]
	rules: { total: number; automated: number; manualReview: number; absentFromSource: number }
	autofix: { safe: number; review: number }
}

export interface ComplianceFile {
	path: string
	content: string
}

/**
 * Minimal transport seam. Production uses axios; tests supply a stub so the unit suite
 * never opens a socket and stays green in CI where no backend exists.
 */
export interface ComplianceTransport {
	post<T>(url: string, body: unknown, token: string): Promise<T>
	get<T>(url: string, token: string): Promise<T>
}

const REQUEST_TIMEOUT_MS = 60_000

class AxiosTransport implements ComplianceTransport {
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

export class ComplianceApiError extends Error {
	readonly status?: number
	readonly validStandards?: string[]

	// Fields are assigned explicitly rather than via TypeScript parameter properties:
	// the unit test runner loads these files through Node's strip-only TypeScript mode,
	// which rejects parameter properties outright and would fail the whole suite.
	constructor(message: string, status?: number, validStandards?: string[]) {
		super(message)
		this.name = "ComplianceApiError"
		this.status = status
		this.validStandards = validStandards
	}
}

export class ComplianceClient {
	private static instance: ComplianceClient | undefined

	private readonly transport: ComplianceTransport
	private readonly baseUrlOverride?: string
	private readonly tokenProvider?: () => Promise<string | null>

	constructor(
		transport: ComplianceTransport = new AxiosTransport(),
		baseUrlOverride?: string,
		tokenProvider?: () => Promise<string | null>,
	) {
		this.transport = transport
		this.baseUrlOverride = baseUrlOverride
		this.tokenProvider = tokenProvider
	}

	static getInstance(): ComplianceClient {
		if (!ComplianceClient.instance) {
			ComplianceClient.instance = new ComplianceClient()
		}
		return ComplianceClient.instance
	}

	/** Test seam — lets a suite install a stubbed client and restore afterwards. */
	static setInstance(instance: ComplianceClient | undefined): void {
		ComplianceClient.instance = instance
	}

	private get baseUrl(): string {
		return `${this.baseUrlOverride ?? aeriocodeEnvConfig.apiBaseUrl}/api/v1/compliance`
	}

	private async requireToken(): Promise<string> {
		const token = this.tokenProvider ? await this.tokenProvider() : await AuthService.getInstance().getAuthToken()

		if (!token) {
			throw new ComplianceApiError(
				"You must be signed in to your Aerio account to run a compliance check. Sign in from the account panel and try again.",
			)
		}
		return token
	}

	private static unwrap<T>(payload: unknown): T {
		const envelope = payload as { success?: boolean; data?: T; message?: string; validStandards?: string[] }
		if (envelope && envelope.success && envelope.data !== undefined) {
			return envelope.data
		}
		throw new ComplianceApiError(
			envelope?.message ?? "Aerio returned an unexpected response to the compliance check",
			undefined,
			envelope?.validStandards,
		)
	}

	private static describeFailure(error: unknown): never {
		if (error instanceof ComplianceApiError) {
			throw error
		}

		const axiosError = error as {
			response?: { status?: number; data?: { message?: string; validStandards?: string[] } }
			code?: string
			message?: string
		}

		const status = axiosError.response?.status
		const serverMessage = axiosError.response?.data?.message

		if (status === 401 || status === 403) {
			throw new ComplianceApiError(
				"Your Aerio session is not valid for compliance checks. Sign in again and retry.",
				status,
			)
		}
		if (status === 404) {
			throw new ComplianceApiError(
				serverMessage ?? "That compliance standard is not available.",
				status,
				axiosError.response?.data?.validStandards,
			)
		}
		if (status === 429) {
			throw new ComplianceApiError("Compliance request limit reached. Wait a moment and try again.", status)
		}
		if (axiosError.code === "ECONNABORTED") {
			throw new ComplianceApiError("Aerio did not respond in time. Try again in a moment.")
		}
		if (axiosError.code === "ECONNREFUSED" || axiosError.code === "ENOTFOUND") {
			throw new ComplianceApiError("Could not reach Aerio. Check your network connection.")
		}

		throw new ComplianceApiError(serverMessage ?? axiosError.message ?? "Compliance request failed", status)
	}

	async listStandards(): Promise<StandardDescriptor[]> {
		try {
			const token = await this.requireToken()
			const payload = await this.transport.get<unknown>(`${this.baseUrl}/standards`, token)
			return ComplianceClient.unwrap<{ standards: StandardDescriptor[] }>(payload).standards
		} catch (error) {
			return ComplianceClient.describeFailure(error)
		}
	}

	async analyze(standard: string, files: ComplianceFile[]): Promise<AnalyzeResult> {
		try {
			const token = await this.requireToken()
			const payload = await this.transport.post<unknown>(`${this.baseUrl}/${standard}/analyze`, { files }, token)
			return ComplianceClient.unwrap<AnalyzeResult>(payload)
		} catch (error) {
			return ComplianceClient.describeFailure(error)
		}
	}

	async autofix(
		standard: string,
		files: ComplianceFile[],
		tier: "safe" | "review" = "safe",
		ruleIds?: string[],
	): Promise<AutofixResult> {
		try {
			const token = await this.requireToken()
			const payload = await this.transport.post<unknown>(
				`${this.baseUrl}/${standard}/autofix`,
				{ files, tier, ruleIds: ruleIds ?? null },
				token,
			)
			return ComplianceClient.unwrap<AutofixResult>(payload)
		} catch (error) {
			return ComplianceClient.describeFailure(error)
		}
	}
}
