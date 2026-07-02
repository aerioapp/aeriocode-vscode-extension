import { aeriocodeEnvConfig } from "@/config"
import { Controller } from "@/core/controller"
import { getRequestRegistry, type StreamingResponseHandler } from "@/core/controller/grpc-handler"
import { featureFlagsService, telemetryService } from "@services/telemetry"
import { AuthState, UserInfo } from "@shared/proto/aeriocode/account"
import { type EmptyRequest, String } from "@shared/proto/aeriocode/common"
import { AeriocodeAuthProvider } from "./providers/AeriocodeAuthProvider"
import { openExternal } from "@/utils/env"
import { FEATURE_FLAGS } from "@/shared/services/feature-flags/feature-flags"
import { HostProvider } from "@/hosts/host-provider"

const DefaultAeriocodeAccountURI = `${aeriocodeEnvConfig.apiBaseUrl}/api/auth/sso-redirect`

let authProviders: any[] = []

export type ServiceConfig = {
	URI?: string
	[key: string]: any
}

const availableAuthProviders = {
	aeriocode: AeriocodeAuthProvider,
	// Add other providers here as needed
}

export interface AeriocodeAuthInfo {
	idToken: string
	userInfo: AeriocodeAccountUserInfo
}

export interface AeriocodeAccountUserInfo {
	createdAt: string
	displayName: string
	email: string
	username: string
	id: string
	organizations: AeriocodeAccountOrganization[]
	/**
	 * Aeriocode app base URL, used for webview UI and other client-side operations
	 */
	appBaseUrl?: string
}

export interface AeriocodeAccountOrganization {
	active: boolean
	memberId: string
	name: string
	organizationId: string
	roles: string[]
}

// TODO: Add logic to handle multiple webviews getting auth updates.

export class AuthService {
	protected static instance: AuthService | null = null
	protected _config: ServiceConfig
	protected _authenticated: boolean = false
	protected _aeriocodeAuthInfo: AeriocodeAuthInfo | null = null
	protected _provider: { provider: AeriocodeAuthProvider } | null = null
	protected _activeAuthStatusUpdateSubscriptions = new Set<[Controller, StreamingResponseHandler<AuthState>]>()
	protected _controller: Controller

	/**
	 * Creates an instance of AuthService.
	 * @param config - Configuration for the service, including the URI for authentication.
	 * @param authProvider - Optional authentication provider to use.
	 * @param controller - Optional reference to the Controller instance.
	 */
	protected constructor(controller: Controller, config: ServiceConfig, authProvider?: any) {
		const providerName = authProvider || "aeriocode"
		this._config = Object.assign({ URI: DefaultAeriocodeAccountURI }, config)

		// Fetch AuthProviders
		// TODO:  Deliver this config from the backend securely
		// ex.  https://app.aeriocode.bot/api/v1/auth/providers

		const authProvidersConfigs = [
			{
				name: "aeriocode",
				config: {},
			},
		]

		// Merge authProviders with availableAuthProviders
		authProviders = authProvidersConfigs.map((provider) => {
			const providerName = provider.name
			const ProviderClass = availableAuthProviders[providerName as keyof typeof availableAuthProviders]
			if (!ProviderClass) {
				throw new Error(`Auth provider "${providerName}" is not available`)
			}
			return {
				name: providerName,
				config: provider.config,
				provider: new ProviderClass(provider.config),
			}
		})

		this._setProvider(authProviders.find((authProvider) => authProvider.name === providerName).name)

		this._controller = controller
	}

	/**
	 * Gets the singleton instance of AuthService.
	 * @param config - Configuration for the service, including the URI for authentication.
	 * @param authProvider - Optional authentication provider to use.
	 * @param controller - Optional reference to the Controller instance.
	 * @returns The singleton instance of AuthService.
	 */
	public static getInstance(controller?: Controller, config?: ServiceConfig, authProvider?: any): AuthService {
		if (!AuthService.instance) {
			if (!controller) {
				console.warn("Extension context was not provided to AuthService.getInstance, using default context")
				controller = {} as Controller
			}
			AuthService.instance = new AuthService(controller, config || {}, authProvider)
		}
		if (controller !== undefined && AuthService.instance) {
			AuthService.instance.controller = controller
		}
		return AuthService.instance!
	}

	set controller(controller: Controller) {
		this._controller = controller
	}

	get authProvider(): any {
		return this._provider
	}

	set authProvider(providerName: string) {
		this._setProvider(providerName)
	}

	async getAuthToken(): Promise<string | null> {
		if (!this._aeriocodeAuthInfo) {
			return null
		}
		const idToken = this._aeriocodeAuthInfo.idToken
		const shouldRefreshIdToken = await this._provider?.provider.shouldRefreshIdToken(idToken)
		if (shouldRefreshIdToken) {
			// Try to refresh the token via the backend refresh endpoint first
			try {
				const refreshedToken = await this._provider?.provider.refreshToken(this._controller, idToken)
				if (refreshedToken) {
					// Update the stored auth info with the new token
					this._aeriocodeAuthInfo = { ...this._aeriocodeAuthInfo, idToken: refreshedToken }
					this._authenticated = true
					// Notify webview subscribers about the refreshed auth state
					await this.sendAuthStatusUpdate()
					return refreshedToken
				}
			} catch (error) {
				console.error("Token refresh failed in getAuthToken:", error)
			}
			// If refresh failed, try full re-authentication
			await this.restoreRefreshTokenAndRetrieveAuthInfo()
			if (!this._aeriocodeAuthInfo) {
				return null
			}
		}
		return this._aeriocodeAuthInfo.idToken
	}

	protected _setProvider(providerName: string): void {
		const providerConfig = authProviders.find((provider) => provider.name === providerName)
		if (!providerConfig) {
			throw new Error(`Auth provider "${providerName}" not found`)
		}

		this._provider = providerConfig
	}

	getInfo(): AuthState {
		// TODO: this logic should be cleaner, but this will determine the authentication state for the webview -- if a user object is returned then the webview assumes authenticated, otherwise it assumes logged out (we previously returned a UserInfo object with empty fields, and this represented a broken logged in state)
		let user: any = null
		if (this._aeriocodeAuthInfo && this._authenticated) {
			const userInfo = this._aeriocodeAuthInfo.userInfo
			// Always use the current environment's appBaseUrl
			const correctAppBaseUrl = aeriocodeEnvConfig?.appBaseUrl

			console.log("DEBUG: AuthService userInfo:", JSON.stringify(userInfo, null, 2))
			console.log("DEBUG: AuthService username:", userInfo?.username)
			user = UserInfo.create({
				// TODO: create proto for new user info type
				uid: userInfo?.id,
				displayName: userInfo?.displayName,
				email: userInfo?.email,
				username: userInfo?.username,
				photoUrl: undefined,
				appBaseUrl: correctAppBaseUrl,
			})
		}

		return AuthState.create({
			user,
		})
	}

	async createAuthRequest(): Promise<String> {
		if (this._authenticated) {
			this.sendAuthStatusUpdate()
			return String.create({ value: "Already authenticated" })
		}

		if (!this._config.URI) {
			throw new Error("Authentication URI is not configured")
		}

		const callbackHost = await HostProvider.get().getCallbackUri()
		const callbackUrl = `${callbackHost}/auth`

		// Use URL object for more graceful query construction
		const authUrl = new URL(this._config.URI)
		authUrl.searchParams.set("callback_url", callbackUrl)

		const authUrlString = authUrl.toString()

		await openExternal(authUrlString)
		return String.create({ value: authUrlString })
	}

	async handleDeauth(): Promise<void> {
		if (!this._provider) {
			throw new Error("Auth provider is not set")
		}

		try {
			this._aeriocodeAuthInfo = null
			this._authenticated = false
			this.sendAuthStatusUpdate()
		} catch (error) {
			console.error("Error signing out:", error)
			throw error
		}
	}

	async handleAuthCallback(token: string, provider: string): Promise<void> {
		if (!this._provider) {
			throw new Error("Auth provider is not set")
		}

		try {
			console.log(`AuthService: Processing auth callback with provider: ${provider}, token length: ${token.length}`)

			// The token from AerioDashboard is actually a session ID, not a JWT token
			// We need to pass it to the signIn method which will handle session validation
			this._aeriocodeAuthInfo = await this._provider.provider.signIn(this._controller, token, provider)
			this._authenticated = true

			await this.sendAuthStatusUpdate()
		} catch (error) {
			console.error("Error signing in with session token:", error)
			// Even if there's an error, we should still try to restore the token
			// This handles cases where the token is valid but the immediate validation failed
			await this.restoreRefreshTokenAndRetrieveAuthInfo()
			if (!this._authenticated) {
				throw error
			}
		}
	}

	/**
	 * Clear the authentication token from the extension's storage.
	 * This is typically called when the user logs out.
	 */
	async clearAuthToken(): Promise<void> {
		this._controller.cacheService.setSecret("aeriocodeAccountId", undefined)
	}

	/**
	 * Restores the authentication token from the extension's storage.
	 * This is typically called when the extension is activated.
	 */
	async restoreRefreshTokenAndRetrieveAuthInfo(): Promise<void> {
		if (!this._provider || !this._provider.provider) {
			throw new Error("Auth provider is not set")
		}

		try {
			this._aeriocodeAuthInfo = await this._provider.provider.retrieveAeriocodeAuthInfo(this._controller)
			if (this._aeriocodeAuthInfo) {
				this._authenticated = true
				await this.sendAuthStatusUpdate()
			} else {
				console.warn("No user found after restoring auth token")
				this._authenticated = false
				this._aeriocodeAuthInfo = null
			}
		} catch (error) {
			console.error("Error restoring auth token:", error)
			this._authenticated = false
			this._aeriocodeAuthInfo = null
			return
		}
	}

	/**
	 * Subscribe to authStatusUpdate events
	 * @param controller The controller instance
	 * @param request The empty request
	 * @param responseStream The streaming response handler
	 * @param requestId The ID of the request (passed by the gRPC handler)
	 */
	async subscribeToAuthStatusUpdate(
		controller: Controller,
		_request: EmptyRequest,
		responseStream: StreamingResponseHandler<AuthState>,
		requestId?: string,
	): Promise<void> {
		console.log("Subscribing to authStatusUpdate")

		// Add this subscription to the active subscriptions
		this._activeAuthStatusUpdateSubscriptions.add([controller, responseStream])
		// Register cleanup when the connection is closed
		const cleanup = () => {
			this._activeAuthStatusUpdateSubscriptions.delete([controller, responseStream])
		}
		// Register the cleanup function with the request registry if we have a requestId
		if (requestId) {
			getRequestRegistry().registerRequest(requestId, cleanup, { type: "authStatusUpdate_subscription" }, responseStream)
		}

		// Send the current authentication status immediately
		try {
			await this.sendAuthStatusUpdate()
		} catch (error) {
			console.error("Error sending initial auth status:", error)
			// Remove the subscription if there was an error
			this._activeAuthStatusUpdateSubscriptions.delete([controller, responseStream])
		}
	}

	/**
	 * Send an authStatusUpdate event to all active subscribers
	 */
	async sendAuthStatusUpdate(): Promise<void> {
		// Send the event to all active subscribers
		const promises = Array.from(this._activeAuthStatusUpdateSubscriptions).map(async ([controller, responseStream]) => {
			try {
				const authInfo: AuthState = this.getInfo()

				await responseStream(
					authInfo,
					false, // Not the last message
				)

				// Identify the user in telemetry if available
				// Fetch the feature flags for the user
				if (this._aeriocodeAuthInfo?.userInfo?.id) {
					telemetryService.identifyAccount(this._aeriocodeAuthInfo.userInfo)
					for (const flag of Object.values(FEATURE_FLAGS)) {
						await featureFlagsService?.isFeatureFlagEnabled(flag)
					}
				}

				// Update the state in the webview
				if (controller) {
					await controller.postStateToWebview()
				}
			} catch (error) {
				console.error("Error sending authStatusUpdate event:", error)
				// Remove the subscription if there was an error
				this._activeAuthStatusUpdateSubscriptions.delete([controller, responseStream])
			}
		})

		await Promise.all(promises)
	}
}
