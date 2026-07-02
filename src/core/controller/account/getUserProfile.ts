import type { Controller } from "../index"
import type { EmptyRequest } from "@shared/proto/aeriocode/common"
import { UserProfileResponse } from "@shared/proto/aeriocode/account"

/**
 * Get current user profile data from the backend
 * @param controller The controller instance
 * @param request Empty request
 * @returns User profile response
 */
export async function getUserProfile(controller: Controller, request: EmptyRequest): Promise<UserProfileResponse> {
	try {
		if (!controller.accountService) {
			throw new Error("Account service not available")
		}

		console.log("Fetching user profile from backend API...")
		// Call the RPC variant to fetch user profile
		const userProfile = await controller.accountService.fetchUserProfileRPC()

		// If the call fails (returns undefined), throw an error
		if (userProfile === undefined) {
			console.error("User profile fetch returned undefined")
			throw new Error("Failed to fetch user profile")
		}

		console.log("DEBUG: User profile fetched successfully:", userProfile)
		const response = UserProfileResponse.create({
			uid: userProfile.uid,
			email: userProfile.email,
			username: userProfile.username,
			displayName: userProfile.display_name,
			photoUrl: userProfile.photo_url,
			appBaseUrl: userProfile.app_base_url,
		})
		console.log("DEBUG: Created UserProfileResponse:", JSON.stringify(response, null, 2))
		return response
	} catch (error) {
		console.error(`Failed to fetch user profile: ${error}`)
		throw error
	}
}
