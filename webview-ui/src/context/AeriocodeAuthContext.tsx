import type { UserOrganization } from "@shared/proto/aeriocode/account"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import deepEqual from "fast-deep-equal"
import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useInterval } from "react-use"
import { AccountServiceClient } from "@/services/grpc-client"

// Define User type (you may need to adjust this based on your actual User type)
export interface AeriocodeUser {
	uid: string
	email?: string
	username?: string
	displayName?: string
	photoUrl?: string
	appBaseUrl?: string
}

export interface AeriocodeAuthContextType {
	aeriocodeUser: AeriocodeUser | null
	organizations: UserOrganization[] | null
	activeOrganization: UserOrganization | null
	refreshUserData: () => Promise<void>
	appBaseUrl?: string
}

const AeriocodeAuthContext = createContext<AeriocodeAuthContextType | undefined>(undefined)

export const AeriocodeAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [user, setUser] = useState<AeriocodeUser | null>(null)
	const [userOrganizations, setUserOrganizations] = useState<UserOrganization[] | null>(null)

	const getUserOrganizations = useCallback(async () => {
		try {
			const response = await AccountServiceClient.getUserOrganizations(EmptyRequest.create())
			if (!deepEqual(response.organizations, userOrganizations)) {
				setUserOrganizations(response.organizations)
			}
		} catch (error) {
			console.error("Failed to fetch user organizations:", error)
		}
	}, [])

	const activeOrganization = useMemo(() => {
		return userOrganizations?.find((org) => org.active) ?? null
	}, [userOrganizations])

	useEffect(() => {
		console.log("Extension: AeriocodeAuthContext: user updated:", user?.uid)
	}, [user?.uid])

	// Function to refresh user data by fetching current profile
	const refreshUserData = useCallback(async () => {
		try {
			console.log("DEBUG: Refreshing user data...")
			// Use the new getUserProfile endpoint to fetch fresh user data
			const response = await AccountServiceClient.getUserProfile(EmptyRequest.create())
			console.log("DEBUG: getUserProfile raw response:", JSON.stringify(response, null, 2))
			if (response) {
				console.log("DEBUG: Refreshed user data:", JSON.stringify(response, null, 2))
				// Convert the response data to our AeriocodeUser format
				const userData = {
					uid: response.uid,
					email: response.email || undefined,
					username: response.username || undefined,
					displayName: response.displayName || undefined,
					photoUrl: response.photoUrl || undefined,
					appBaseUrl: response.appBaseUrl || undefined,
				}
				console.log("DEBUG: Converted user data:", JSON.stringify(userData, null, 2))
				setUser(userData)
				await getUserOrganizations()
			}
		} catch (error) {
			console.error("Failed to refresh user data:", error)
			// Fallback to authStateChanged if getUserProfile fails
			try {
				const authResponse = await AccountServiceClient.authStateChanged({
					user: user || undefined,
					metadata: undefined,
				})
				if (authResponse?.user) {
					console.log("DEBUG: Refreshed user data via auth fallback:", JSON.stringify(authResponse.user, null, 2))
					setUser(authResponse.user)
					await getUserOrganizations()
				}
			} catch (fallbackError) {
				console.error("Auth fallback also failed:", fallbackError)
			}
		}
	}, [getUserOrganizations, user])

	// Poll user data every 60 seconds to catch profile updates (reduced frequency to avoid rate limits)
	useInterval(() => {
		if (user) {
			console.log("Automatic refresh: polling user data...")
			refreshUserData()
		}
	}, 60000)

	// Handle auth status update events
	useEffect(() => {
		const cancelSubscription = AccountServiceClient.subscribeToAuthStatusUpdate(EmptyRequest.create(), {
			onResponse: async (response: any) => {
				console.log("DEBUG: AeriocodeAuthContext received user:", JSON.stringify(response?.user, null, 2))
				if (!response?.user?.uid) {
					setUser(null)
				}
				if (response?.user) {
					// Update user data even if UID is the same but other fields changed
					const currentUserStr = JSON.stringify(user)
					const newUserStr = JSON.stringify(response.user)

					if (currentUserStr !== newUserStr) {
						console.log("DEBUG: User data changed, updating with username:", response.user.username)
						setUser(response.user)
						// Once we have a new user, fetch organizations that
						// allow us to display the active account in account view UI
						// and fetch the correct credit balance to display on mount
						await getUserOrganizations()
					}
				}
			},
			onError: (error: Error) => {
				console.error("Error in auth callback subscription:", error)
			},
			onComplete: () => {
				console.log("Auth callback subscription completed")
			},
		})

		// Cleanup function to cancel subscription when component unmounts
		return () => {
			cancelSubscription()
		}
	}, [])

	return (
		<AeriocodeAuthContext.Provider
			value={{
				aeriocodeUser: user,
				organizations: userOrganizations,
				activeOrganization,
				refreshUserData,
				appBaseUrl: user?.appBaseUrl,
			}}>
			{children}
		</AeriocodeAuthContext.Provider>
	)
}

export const useAeriocodeAuth = () => {
	const context = useContext(AeriocodeAuthContext)
	if (context === undefined) {
		throw new Error("useAeriocodeAuth must be used within a AeriocodeAuthProvider")
	}
	return context
}

export const handleSignIn = async () => {
	try {
		AccountServiceClient.accountLoginClicked(EmptyRequest.create()).catch((err) =>
			console.error("Failed to get login URL:", err),
		)
	} catch (error) {
		console.error("Error signing in:", error)
		throw error
	}
}

export const handleSignOut = async () => {
	try {
		await AccountServiceClient.accountLogoutClicked(EmptyRequest.create()).catch((err) =>
			console.error("Failed to logout:", err),
		)
	} catch (error) {
		console.error("Error signing out:", error)
		throw error
	}
}
