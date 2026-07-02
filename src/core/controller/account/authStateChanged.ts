import { AuthStateChangedRequest, AuthState } from "@shared/proto/aeriocode/account"
import { aeriocodeEnvConfig } from "@/config"
import type { Controller } from "../index"
import { updateGlobalState } from "../../storage/state"

/**
 * Handles authentication state changes from the Firebase context.
 * Updates the user info in global state and returns the updated value.
 * @param controller The controller instance
 * @param request The auth state change request
 * @returns The updated user info
 */
export async function authStateChanged(controller: Controller, request: AuthStateChangedRequest): Promise<AuthState> {
	try {
		// Add the correct appBaseUrl from the current environment configuration
		const userInfoWithCorrectUrl = {
			...request.user,
			appBaseUrl: aeriocodeEnvConfig.appBaseUrl,
		}

		// Store the user info with correct appBaseUrl in global state
		await updateGlobalState(controller.context, "userInfo", userInfoWithCorrectUrl)

		// Return the updated user info
		return AuthState.create({ user: userInfoWithCorrectUrl })
	} catch (error) {
		console.error(`Failed to update auth state: ${error}`)
		throw error
	}
}
