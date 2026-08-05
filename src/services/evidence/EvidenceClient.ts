import axios from "axios"
import { aeriocodeEnvConfig } from "@/config"
import { AuthService } from "@/services/auth/AuthService"

/**
 * Client for the Aeriocode backend evidence API.
 *
 * Certification evidence is chained and signed server-side, where the developer whose work
 * is being audited cannot reach it. This client pushes the local trail there; it never
 * computes a hash or a signature itself, because a chain the client could construct is a
 * chain the client could forge.
 */

export interface EvidenceEntry {
	eventType: string
	eventAction: string
	userId?: string
	taskId?: string
	entityType?: string
	entityId?: string
	occurredAt?: string
	payload?: Record<string, unknown>
	/** Stable per local entry. What makes a retry after a dropped response harmless. */
	clientEntryId?: string
	/** The local chain's hash for this entry, retained server-side as data, not as its link. */
	clientChainHash?: string
}

export interface AppendResult {
	appended: Array<{ seq: number; entryHash: string; signed: boolean }>
	skipped: Array<{ clientEntryId: string; seq: number; reason: string }>
	tipSeq: number
	tipHash: string | null
}

export interface EvidenceTransport {
	post<T>(url: string, body: unknown, token: string): Promise<T>
	get<T>(url: string, token: string): Promise<T>
}

const REQUEST_TIMEOUT_MS = 30_000

class AxiosTransport implements EvidenceTransport {
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

export class EvidenceApiError extends Error {
	readonly status?: number
	/**
	 * True when retrying later could plausibly succeed — no network, a timeout, a 5xx, a
	 * rate limit. The sync engine uses this to decide between backing off and giving up:
	 * a rejected batch retried forever would block the queue behind it permanently.
	 */
	readonly retryable: boolean

	// Explicit assignment rather than parameter properties — the unit runner strips types
	// without transforming them and rejects parameter properties outright.
	constructor(message: string, status?: number, retryable = false) {
		super(message)
		this.name = "EvidenceApiError"
		this.status = status
		this.retryable = retryable
	}
}

export class EvidenceClient {
	private static instance: EvidenceClient | undefined

	private readonly transport: EvidenceTransport
	private readonly baseUrlOverride?: string
	private readonly tokenProvider?: () => Promise<string | null>

	constructor(
		transport: EvidenceTransport = new AxiosTransport(),
		baseUrlOverride?: string,
		tokenProvider?: () => Promise<string | null>,
	) {
		this.transport = transport
		this.baseUrlOverride = baseUrlOverride
		this.tokenProvider = tokenProvider
	}

	static getInstance(): EvidenceClient {
		if (!EvidenceClient.instance) {
			EvidenceClient.instance = new EvidenceClient()
		}
		return EvidenceClient.instance
	}

	static setInstance(instance: EvidenceClient | undefined): void {
		EvidenceClient.instance = instance
	}

	private get baseUrl(): string {
		return `${this.baseUrlOverride ?? aeriocodeEnvConfig.apiBaseUrl}/api/v1/evidence`
	}

	private async requireToken(): Promise<string> {
		const token = this.tokenProvider ? await this.tokenProvider() : await AuthService.getInstance().getAuthToken()
		if (!token) {
			// Retryable: the user may simply not have signed in yet, and the queued entries
			// are still valid once they do.
			throw new EvidenceApiError("Not signed in to an Aerio account", undefined, true)
		}
		return token
	}

	private static unwrap<T>(payload: unknown): T {
		const envelope = payload as { success?: boolean; data?: T; message?: string }
		if (envelope && envelope.success && envelope.data !== undefined) {
			return envelope.data
		}
		throw new EvidenceApiError(envelope?.message ?? "Aerio returned an unexpected response from the evidence API")
	}

	private static describeFailure(error: unknown): never {
		if (error instanceof EvidenceApiError) {
			throw error
		}

		const axiosError = error as {
			response?: { status?: number; data?: { message?: string } }
			code?: string
			message?: string
		}
		const status = axiosError.response?.status
		const serverMessage = axiosError.response?.data?.message

		// A transport-level failure is always worth retrying: nothing about the batch was
		// wrong, we just could not deliver it.
		if (["ECONNABORTED", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN"].includes(axiosError.code ?? "")) {
			throw new EvidenceApiError(`Could not reach the Aerio evidence service (${axiosError.code})`, undefined, true)
		}
		if (status === 401 || status === 403) {
			throw new EvidenceApiError("Aerio session is not valid for the evidence API", status, true)
		}
		if (status === 429) {
			throw new EvidenceApiError("Evidence request limit reached", status, true)
		}
		if (status !== undefined && status >= 500) {
			throw new EvidenceApiError(serverMessage ?? "Aerio evidence service error", status, true)
		}

		// A 4xx other than the above means the batch itself is unacceptable. Retrying cannot
		// fix it, and doing so would wedge the queue behind an entry that will never land.
		throw new EvidenceApiError(serverMessage ?? axiosError.message ?? "Evidence request failed", status, false)
	}

	/** Register or touch the project. Idempotent. */
	async ensureProject(
		projectKey: string,
		meta: { displayName?: string; profileStandard?: string; profileLevel?: string } = {},
	) {
		try {
			const token = await this.requireToken()
			const payload = await this.transport.post<unknown>(`${this.baseUrl}/projects`, { projectKey, ...meta }, token)
			return EvidenceClient.unwrap<{ project: Record<string, unknown> }>(payload).project
		} catch (error) {
			return EvidenceClient.describeFailure(error)
		}
	}

	async appendEntries(projectKey: string, entries: EvidenceEntry[]): Promise<AppendResult> {
		try {
			const token = await this.requireToken()
			const payload = await this.transport.post<unknown>(
				`${this.baseUrl}/projects/${encodeURIComponent(projectKey)}/audit`,
				{ entries },
				token,
			)
			return EvidenceClient.unwrap<AppendResult>(payload)
		} catch (error) {
			return EvidenceClient.describeFailure(error)
		}
	}

	async verifyChain(projectKey: string) {
		try {
			const token = await this.requireToken()
			const payload = await this.transport.post<unknown>(
				`${this.baseUrl}/projects/${encodeURIComponent(projectKey)}/verify`,
				{},
				token,
			)
			return EvidenceClient.unwrap<{
				valid: boolean
				entriesChecked: number
				brokenAtSeq: number | null
				reason: string | null
				signedEntries?: number
				unsignedEntries?: number
				verificationKey: string | null
			}>(payload)
		} catch (error) {
			return EvidenceClient.describeFailure(error)
		}
	}
}
