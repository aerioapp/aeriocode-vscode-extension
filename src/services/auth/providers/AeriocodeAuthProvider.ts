import { errorService } from "@services/telemetry"
import axios from "axios"
import { jwtDecode } from "jwt-decode"
import type { ExtensionContext } from "vscode"
import { aeriocodeEnvConfig } from "@/config"
import type { AeriocodeAccountUserInfo, AeriocodeAuthInfo } from "../AuthService"
import { Controller } from "@/core/controller"

export class AeriocodeAuthProvider {
	private _config: any

	constructor(config: any) {
		this._config = config || {}
	}

	get config(): any {
		return this._config
	}

	set config(value: any) {
		this._config = value
	}

	async shouldRefreshIdToken(existingIdToken: string): Promise<boolean> {
		// Opaque session tokens (64-char hex) don't have expiration - backend handles validation
		if (existingIdToken.length === 64 && /^[0-9a-f]{64}$/.test(existingIdToken)) {
			return false
		}
		const decodedToken = jwtDecode(existingIdToken)
		const exp = decodedToken.exp || 0
		const expirationTime = exp * 1000
		const currentTime = Date.now()
		// Refresh if token expires within 10 minutes (gives ample time for refresh)
		const tenMinutesInMs = 10 * 60 * 1000
		if (currentTime > expirationTime - tenMinutesInMs) {
			return true // id token is expired or about to be expired
		}
		return false
	}

	/**
	 * Refresh the authentication token by calling the backend refresh endpoint.
	 * This implements sliding expiration - each refresh extends the session by 60 days.
	 * @param controller - The controller instance
	 * @param currentToken - The current (possibly expired) token to refresh
	 * @returns {Promise<string|null>} The new token or null if refresh failed
	 */
	async refreshToken(controller: Controller, currentToken: string): Promise<string | null> {
		try {
			console.log("🔄 Attempting token refresh via /api/auth/refresh-token...")
			const refreshResponse = await axios.post(
				`${aeriocodeEnvConfig.apiBaseUrl}/api/auth/refresh-token`,
				{ token: currentToken },
				{
					headers: {
						"Content-Type": "application/json",
						"X-Session-ID": currentToken,
					},
					withCredentials: true,
				},
			)

			if (refreshResponse.status === 200 && refreshResponse.data.success && refreshResponse.data.token) {
				const newToken = refreshResponse.data.token
				console.log(`✅ Token refreshed successfully - session extended by 60 days`)

				// Store the new token
				try {
					controller.cacheService.setSecret("aeriocodeAccountId", newToken)
				} catch (error) {
					errorService.logMessage("Failed to store refreshed token", "error")
					errorService.logException(error)
				}

				return newToken
			} else {
				console.log("Token refresh failed - invalid response")
				return null
			}
		} catch (error) {
			console.error("Token refresh failed:", error.message)
			errorService.logMessage("Token refresh failed", "error")
			errorService.logException(error)
			return null
		}
	}

	/**
	 * Restores the authentication token using a provided token.
	 * @param token - The authentication token to restore.
	 * @returns {Promise<AeriocodeAuthInfo>} A promise that resolves with the authenticated user info.
	 * @throws {Error} Throws an error if the restoration fails.
	 */
	async retrieveAeriocodeAuthInfo(controller: Controller): Promise<AeriocodeAuthInfo | null> {
		let userToken = controller.cacheService.getSecretKey("aeriocodeAccountId")
		console.log(`🔍 retrieveAeriocodeAuthInfo: Retrieved token: ${userToken?.substring(0, 20)}...`)
		if (!userToken) {
			console.error("No stored authentication credential found.")
			return null
		}

		// Check if token is expired or about to expire and refresh it first
		try {
			const shouldRefresh = await this.shouldRefreshIdToken(userToken)
			if (shouldRefresh) {
				console.log("🔄 Token is expired or about to expire, refreshing...")
				const refreshedToken = await this.refreshToken(controller, userToken)
				if (refreshedToken) {
					userToken = refreshedToken
					console.log("✅ Token refreshed successfully, using new token")
				} else {
					console.log("⚠️ Token refresh failed, trying with existing token")
				}
			}
		} catch (refreshError) {
			console.log("⚠️ Token refresh check failed:", refreshError.message)
		}

		// Try cookie-based authentication first (new approach) - include session ID in header
		try {
			console.log("🔍 Attempting cookie-based authentication with session ID...")
			const cookieResponse = await axios.post(
				`${aeriocodeEnvConfig.apiBaseUrl}/api/auth/validate-cookie`,
				{},
				{
					withCredentials: true, // Include cookies in the request
					headers: {
						"Content-Type": "application/json",
						"X-Session-ID": userToken, // Pass session ID as header
					},
				},
			)

			if (cookieResponse.status === 200) {
				console.log("✅ Cookie-based authentication successful")
				const userInfo: AeriocodeAccountUserInfo = {
					id: cookieResponse.data.user.id,
					email: cookieResponse.data.user.email,
					username: cookieResponse.data.user.username,
					displayName: `${cookieResponse.data.user.firstName} ${cookieResponse.data.user.lastName}`,
					createdAt: new Date().toISOString(),
					organizations: [],
					appBaseUrl: aeriocodeEnvConfig.appBaseUrl,
				}
				return { idToken: userToken, userInfo }
			} else {
				console.log(`Cookie-based auth failed with status: ${cookieResponse.status}`, cookieResponse.data)
			}
		} catch (cookieError) {
			console.log("Cookie-based auth failed, falling back to header-based auth:", cookieError.message)
		}

		// Fallback to header-based authentication using the new cookie-based user info endpoint - include session ID in header
		try {
			const userResponse = await axios.get(`${aeriocodeEnvConfig.apiBaseUrl}/api/auth/me-cookie`, {
				headers: {
					"X-Session-ID": userToken, // Pass session ID as header
				},
				withCredentials: true, // Include cookies for session-based auth
			})

			// Return user data
			const userInfo: AeriocodeAccountUserInfo = {
				id: userResponse.data.id,
				email: userResponse.data.email,
				username: userResponse.data.username,
				displayName: `${userResponse.data.firstName} ${userResponse.data.lastName}`,
				createdAt: new Date().toISOString(),
				organizations: [],
				appBaseUrl: aeriocodeEnvConfig.appBaseUrl,
			}
			console.log("DEBUG: Backend user response data:", JSON.stringify(userResponse.data, null, 2))
			console.log("DEBUG: Username from backend:", userInfo.username)
			return { idToken: userToken, userInfo }
		} catch (error) {
			console.error("Backend token validation error", error)
			errorService.logMessage("Backend token validation error", "error")
			errorService.logException(error)
			// Don't throw the error, just return null to indicate no valid auth
			return null
		}
	}

	/**
	 * Signs in the user using backend authentication with a session ID.
	 * @returns {Promise<AeriocodeAuthInfo>} A promise that resolves with the authenticated user info.
	 * @throws {Error} Throws an error if the sign-in fails.
	 */
	async signIn(controller: Controller, sessionId: string, provider: string): Promise<AeriocodeAuthInfo | null> {
		try {
			// Only handle backend provider (local API authentication)
			if (provider !== "backend") {
				throw new Error(`Unsupported provider: ${provider}. Only backend provider is supported.`)
			}

			// The sessionId is from AerioDashboard, we need to establish cookie-based auth with aeriocode backend
			console.log(`🔍 AeriocodeAuthProvider.signIn: Attempting to validate session ID: ${sessionId?.substring(0, 20)}...`)

			try {
				// First, try to validate the session by calling the cookie validation endpoint
				// This will establish the session cookies for subsequent requests
				const validateResponse = await axios.post(
					`${aeriocodeEnvConfig.apiBaseUrl}/api/auth/validate-cookie`,
					{},
					{
						headers: {
							"X-Session-ID": sessionId, // Pass session ID as header for validation
							"Content-Type": "application/json",
						},
						withCredentials: true, // This should establish cookies if validation succeeds
					},
				)

				if (validateResponse.status === 200 && validateResponse.data.success) {
					console.log("✅ Session validation successful, cookies established")

					// Store the session ID in secret storage
					try {
						controller.cacheService.setSecret("aeriocodeAccountId", sessionId)
					} catch (error) {
						errorService.logMessage("Backend store session error", "error")
						errorService.logException(error)
						throw error
					}

					// Return user data from the validation response
					const userInfo: AeriocodeAccountUserInfo = {
						id: validateResponse.data.user.id,
						email: validateResponse.data.user.email,
						username: validateResponse.data.user.username,
						displayName: `${validateResponse.data.user.firstName} ${validateResponse.data.user.lastName}`,
						createdAt: new Date().toISOString(),
						organizations: [],
						appBaseUrl: aeriocodeEnvConfig.appBaseUrl,
					}
					return { idToken: sessionId, userInfo }
				} else {
					throw new Error("Session validation failed")
				}
			} catch (error) {
				console.error("Session validation error:", error)
				// Fallback: try to use the session ID directly with the me-cookie endpoint
				// This might work if the backend can extract session info from the request
				try {
					const userResponse = await axios.get(`${aeriocodeEnvConfig.apiBaseUrl}/api/auth/me-cookie`, {
						headers: {
							"X-Session-ID": sessionId, // Pass session ID as header
							"Content-Type": "application/json",
						},
						withCredentials: true,
					})

					// Store the session ID in secret storage
					try {
						controller.cacheService.setSecret("aeriocodeAccountId", sessionId)
					} catch (error) {
						errorService.logMessage("Backend store session error", "error")
						errorService.logException(error)
						throw error
					}

					// Return user data
					const userInfo: AeriocodeAccountUserInfo = {
						id: userResponse.data.id,
						email: userResponse.data.email,
						username: userResponse.data.username,
						displayName: `${userResponse.data.firstName} ${userResponse.data.lastName}`,
						createdAt: new Date().toISOString(),
						organizations: [],
						appBaseUrl: aeriocodeEnvConfig.appBaseUrl,
					}
					return { idToken: sessionId, userInfo }
				} catch (fallbackError) {
					errorService.logMessage("Backend authentication error", "error")
					errorService.logException(fallbackError)
					throw fallbackError
				}
			}
		} catch (error) {
			errorService.logMessage("Backend sign-in error", "error")
			errorService.logException(error)
			throw error
		}
	}
}
