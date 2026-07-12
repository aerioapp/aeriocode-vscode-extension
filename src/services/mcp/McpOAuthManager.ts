import { CacheService } from "@core/storage/CacheService"
import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import type { OAuthClientInformationFull, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js"
import crypto from "crypto"
import { HostProvider } from "@/hosts/host-provider"
import { Logger } from "@services/logging/Logger"
import { openExternal } from "@/utils/env"
import { McpOAuthRedirectResolver } from "./McpOAuthRedirectResolver"

/**
 * Generate a hash for a server to use as a storage key
 */
function getServerAuthHash(serverName: string, serverUrl: string): string {
	return crypto.createHash("sha256").update(`${serverName}:${serverUrl}`).digest("hex").substring(0, 16)
}

/**
 * Generate a callback path for MCP server OAuth
 */
function getMcpServerCallbackPath(serverName: string, serverUrl: string): string {
	const hash = getServerAuthHash(serverName, serverUrl)
	return `/mcp-auth/callback/${hash}`
}

/**
 * Structure for all OAuth data stored in the single mcpOAuthSecrets JSON
 */
interface McpOAuthSecrets {
	[serverHash: string]: {
		tokens?: OAuthTokens
		tokens_saved_at?: number
		client_info?: OAuthClientInformationFull
		redirect_url_at_registration?: string
		code_verifier?: string
		oauth_state?: string
		oauth_state_timestamp?: number
		pending_auth_url?: string
	}
}

/**
 * Helper to read OAuth secrets from storage
 */
function getMcpOAuthSecrets(cacheService: CacheService): McpOAuthSecrets {
	const secretsJson = cacheService.getSecretKey("mcpOAuthSecrets")
	if (!secretsJson) {
		return {}
	}
	try {
		return JSON.parse(secretsJson) as McpOAuthSecrets
	} catch (error) {
		Logger.error("[McpOAuth] Failed to parse MCP OAuth secrets:", error)
		return {}
	}
}

/**
 * Helper to save OAuth secrets to storage
 */
function saveMcpOAuthSecrets(cacheService: CacheService, secrets: McpOAuthSecrets): void {
	cacheService.setSecret("mcpOAuthSecrets", JSON.stringify(secrets))
}

/**
 * Implementation of OAuthClientProvider for AerioCode
 * Manages OAuth state and token storage for a single MCP server
 */
class AerioOAuthClientProvider implements OAuthClientProvider {
	private serverName: string
	private serverUrl: string
	private _redirectUrl: string
	private isRegistrationValid: boolean
	private serverHash: string
	private cacheService: CacheService

	constructor(serverName: string, serverUrl: string, cacheService: CacheService) {
		this.serverName = serverName
		this.serverUrl = serverUrl
		this.serverHash = getServerAuthHash(serverName, serverUrl)
		this.cacheService = cacheService

		this._redirectUrl = ""
		this.isRegistrationValid = false
	}

	async initialize(): Promise<void> {
		const callbackPath = getMcpServerCallbackPath(this.serverName, this.serverUrl)
		const secrets = getMcpOAuthSecrets(this.cacheService)
		const savedRedirectUrl = secrets[this.serverHash]?.redirect_url_at_registration

		const getCallbackUrl = async (path: string, preferredPort?: number): Promise<string> => {
			// Use the HostProvider's callback URI mechanism
			const baseUri = await HostProvider.get().getCallbackUri()
			return `${baseUri}${path}`
		}

		const resolution = await McpOAuthRedirectResolver.resolve(savedRedirectUrl, callbackPath, getCallbackUrl)

		this._redirectUrl = resolution.redirectUrl
		this.isRegistrationValid = resolution.isRegistrationValid
	}

	get redirectUrl(): string {
		return this._redirectUrl
	}

	get clientMetadata(): OAuthClientMetadata {
		return {
			redirect_uris: [this._redirectUrl],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			client_name: "AerioCode",
			client_uri: "https://aerio.bot",
			software_id: "aeriocode",
		}
	}

	state(): string {
		return crypto.randomBytes(32).toString("hex")
	}

	async clientInformation(): Promise<OAuthClientInformationFull | undefined> {
		if (!this.isRegistrationValid) {
			const secrets = getMcpOAuthSecrets(this.cacheService)
			if (secrets[this.serverHash]?.client_info) {
				Logger.log(`[McpOAuth] Discarding stale client registration for ${this.serverName} — redirect URL changed`)
				delete secrets[this.serverHash].client_info
				delete secrets[this.serverHash].redirect_url_at_registration
				delete secrets[this.serverHash].tokens
				delete secrets[this.serverHash].tokens_saved_at
				saveMcpOAuthSecrets(this.cacheService, secrets)
			}
			return undefined
		}

		const secrets = getMcpOAuthSecrets(this.cacheService)
		return secrets[this.serverHash]?.client_info
	}

	async saveClientInformation(clientInformation: OAuthClientInformationFull): Promise<void> {
		const secrets = getMcpOAuthSecrets(this.cacheService)
		if (!secrets[this.serverHash]) {
			secrets[this.serverHash] = {}
		}
		secrets[this.serverHash].client_info = clientInformation
		secrets[this.serverHash].redirect_url_at_registration = this._redirectUrl
		saveMcpOAuthSecrets(this.cacheService, secrets)

		this.isRegistrationValid = true
	}

	async tokens(): Promise<OAuthTokens | undefined> {
		const secrets = getMcpOAuthSecrets(this.cacheService)
		const serverData = secrets[this.serverHash]

		if (!serverData?.tokens) {
			return undefined
		}

		if (serverData.tokens_saved_at && serverData.tokens.expires_in) {
			const expiresInMs = serverData.tokens.expires_in * 1000

			if (serverData.tokens_saved_at + expiresInMs < Date.now()) {
				if (serverData.tokens.refresh_token) {
					Logger.log(`[McpOAuth] Token expired for ${this.serverName}, will attempt refresh`)
					return serverData.tokens
				}
				return undefined
			}
		}

		return serverData.tokens
	}

	async saveTokens(tokens: OAuthTokens): Promise<void> {
		Logger.log(`[McpOAuth] Tokens saved for ${this.serverName}`)

		const secrets = getMcpOAuthSecrets(this.cacheService)
		if (!secrets[this.serverHash]) {
			secrets[this.serverHash] = {}
		}

		secrets[this.serverHash].tokens = tokens
		secrets[this.serverHash].tokens_saved_at = Date.now()
		saveMcpOAuthSecrets(this.cacheService, secrets)
	}

	async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
		const existingTokens = await this.tokens()
		if (existingTokens && existingTokens.access_token) {
			Logger.warn(`[McpOAuth] Preserving existing tokens for ${this.serverName}`)
			return
		}

		const state = crypto.randomBytes(32).toString("hex")
		authorizationUrl.searchParams.set("state", state)

		const secrets = getMcpOAuthSecrets(this.cacheService)
		if (!secrets[this.serverHash]) {
			secrets[this.serverHash] = {}
		}

		secrets[this.serverHash].oauth_state = state
		secrets[this.serverHash].oauth_state_timestamp = Date.now()
		secrets[this.serverHash].pending_auth_url = authorizationUrl.toString()
		saveMcpOAuthSecrets(this.cacheService, secrets)

		Logger.log(`[McpOAuth] OAuth required for ${this.serverName} - user must click Authenticate button`)
	}

	async saveCodeVerifier(codeVerifier: string): Promise<void> {
		const secrets = getMcpOAuthSecrets(this.cacheService)
		if (!secrets[this.serverHash]) {
			secrets[this.serverHash] = {}
		}
		secrets[this.serverHash].code_verifier = codeVerifier
		saveMcpOAuthSecrets(this.cacheService, secrets)
	}

	async codeVerifier(): Promise<string> {
		const secrets = getMcpOAuthSecrets(this.cacheService)
		const verifier = secrets[this.serverHash]?.code_verifier

		if (!verifier) {
			throw new Error(`No code verifier found for ${this.serverName}`)
		}

		return verifier
	}

	async isAuthenticated(): Promise<boolean> {
		const tokens = await this.tokens()
		return Boolean(tokens && tokens.access_token)
	}

	getServerHash(): string {
		return this.serverHash
	}
}

/**
 * Manages OAuth authentication for MCP servers
 * Creates and manages OAuthClientProvider instances and handles token storage
 */
export class McpOAuthManager {
	private providers: Map<string, OAuthClientProvider> = new Map()
	private readonly STATE_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes
	private cacheService: CacheService

	constructor(cacheService: CacheService) {
		this.cacheService = cacheService
	}

	/**
	 * Gets or creates an OAuthClientProvider for a server
	 */
	async getOrCreateProvider(serverName: string, serverUrl: string): Promise<OAuthClientProvider> {
		const key = `${serverName}:${serverUrl}`
		if (this.providers.has(key)) {
			return this.providers.get(key)!
		}

		const provider = new AerioOAuthClientProvider(serverName, serverUrl, this.cacheService)
		await provider.initialize()
		this.providers.set(key, provider)
		return provider
	}

	/**
	 * Validates and clears stored OAuth state using hash-based lookup
	 */
	validateAndClearState(serverHash: string, state: string): boolean {
		const secrets = getMcpOAuthSecrets(this.cacheService)
		const serverData = secrets[serverHash]

		if (!serverData?.oauth_state) {
			Logger.error(`No stored state found for server hash: ${serverHash}`)
			return false
		}

		if (serverData.oauth_state_timestamp) {
			if (Date.now() - serverData.oauth_state_timestamp > this.STATE_EXPIRY_MS) {
				Logger.error(`OAuth state expired for server hash: ${serverHash}`)
				delete serverData.oauth_state
				delete serverData.oauth_state_timestamp
				saveMcpOAuthSecrets(this.cacheService, secrets)
				return false
			}
		}

		const isValid = serverData.oauth_state === state

		delete serverData.oauth_state
		delete serverData.oauth_state_timestamp
		saveMcpOAuthSecrets(this.cacheService, secrets)

		return isValid
	}

	/**
	 * Opens the browser to the stored OAuth URL when user clicks "Authenticate"
	 */
	async startOAuthFlow(serverName: string, serverUrl: string): Promise<void> {
		const serverHash = getServerAuthHash(serverName, serverUrl)
		const secrets = getMcpOAuthSecrets(this.cacheService)
		const storedAuthUrl = secrets[serverHash]?.pending_auth_url

		if (storedAuthUrl) {
			await openExternal(storedAuthUrl)
		} else {
			throw new Error(`No pending authorization URL found for ${serverName}. Please try restarting the server first.`)
		}
	}

	/**
	 * Clears all OAuth data for a server (used when server is deleted)
	 */
	async clearServerAuth(serverName: string, serverUrl: string): Promise<void> {
		const key = `${serverName}:${serverUrl}`
		const serverHash = getServerAuthHash(serverName, serverUrl)

		this.providers.delete(key)

		const secrets = getMcpOAuthSecrets(this.cacheService)
		delete secrets[serverHash]
		saveMcpOAuthSecrets(this.cacheService, secrets)
	}
}
