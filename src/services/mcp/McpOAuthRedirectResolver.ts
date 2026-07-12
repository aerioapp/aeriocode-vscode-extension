import { Logger } from "@services/logging/Logger"

/**
 * Result of resolving an OAuth redirect URL for an MCP server.
 */
export interface RedirectUrlResolution {
	/** The resolved redirect URL to use for OAuth */
	redirectUrl: string
	/** Whether the previously saved client registration can be reused */
	isRegistrationValid: boolean
}

/**
 * Function type for obtaining a callback URL.
 * @param path - The callback path (e.g., /mcp-auth/callback/{hash})
 * @param preferredPort - Optional port to try binding first
 */
export type GetCallbackUrlFn = (path: string, preferredPort?: number) => Promise<string>

/**
 * Pure logic for MCP OAuth redirect URL resolution.
 *
 * Solves the problem where a dynamically-registered OAuth client_id becomes
 * stale when the local callback server port changes between sessions.
 * OAuth servers reject authorization requests where the
 * redirect_uri doesn't match the URI registered for the client_id.
 *
 * Strategy:
 * 1. If we have a saved redirect URL from a previous registration, extract the port
 * 2. Ask the callback URL provider to try that port first
 * 3. If we get the same URL back → existing registration is valid
 * 4. If port was unavailable or URL differs → force re-registration
 */
export class McpOAuthRedirectResolver {
	/**
	 * Extract the port number from an http://127.0.0.1:{port}/... URL.
	 */
	static extractLoopbackPort(url: string): number | undefined {
		if (!McpOAuthRedirectResolver.isLoopbackUrl(url)) {
			return undefined
		}

		try {
			const parsed = new URL(url)
			const port = Number.parseInt(parsed.port, 10)
			return Number.isNaN(port) || port <= 0 || port > 65535 ? undefined : port
		} catch {
			return undefined
		}
	}

	/**
	 * Determines if a redirect URL is an http://127.0.0.1 loopback URL
	 */
	static isLoopbackUrl(url: string): boolean {
		try {
			const parsed = new URL(url)
			return parsed.protocol === "http:" && parsed.hostname === "127.0.0.1"
		} catch {
			return false
		}
	}

	/**
	 * Determines if two redirect URLs are compatible for OAuth client reuse.
	 */
	static isRedirectCompatible(savedRedirectUrl: string | undefined, currentRedirectUrl: string): boolean {
		if (savedRedirectUrl === undefined) {
			return false
		}
		return savedRedirectUrl === currentRedirectUrl
	}

	/**
	 * Resolves the redirect URL, attempting to preserve existing client registrations.
	 *
	 * @param savedRedirectUrl - The redirect URL from a previous registration
	 * @param callbackPath - The OAuth callback path
	 * @param getCallbackUrl - Function to get a callback URL, optionally with a preferred port
	 */
	static async resolve(
		savedRedirectUrl: string | undefined,
		callbackPath: string,
		getCallbackUrl: GetCallbackUrlFn,
	): Promise<RedirectUrlResolution> {
		const preferredPort =
			savedRedirectUrl !== undefined ? McpOAuthRedirectResolver.extractLoopbackPort(savedRedirectUrl) : undefined

		const redirectUrl = await getCallbackUrl(callbackPath, preferredPort)

		const isRegistrationValid = McpOAuthRedirectResolver.isRedirectCompatible(savedRedirectUrl, redirectUrl)

		if (savedRedirectUrl !== undefined && !isRegistrationValid) {
			Logger.log(
				`[McpOAuthRedirectResolver] Redirect URL changed: saved="${savedRedirectUrl}" current="${redirectUrl}" — client re-registration required`,
			)
		}

		return { redirectUrl, isRegistrationValid }
	}
}
