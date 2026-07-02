import type { UsageTransaction as AeriocodeAccountUsageTransaction, PaymentTransaction } from "@shared/AeriocodeAccount"
import type { UserOrganization } from "@shared/proto/aeriocode/account"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { VSCodeButton, VSCodeDivider, VSCodeDropdown, VSCodeOption, VSCodeTag } from "@vscode/webview-ui-toolkit/react"
import deepEqual from "fast-deep-equal"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useInterval } from "react-use"
import { type AeriocodeUser, handleSignOut, useAeriocodeAuth } from "@/context/AeriocodeAuthContext"
import { AccountServiceClient } from "@/services/grpc-client"
import VSCodeButtonLink from "../common/VSCodeButtonLink"
import { AccountWelcomeView } from "./AccountWelcomeView"
import { UsageBalance } from "./UsageBalance"
import CreditsHistoryTable from "./CreditsHistoryTable"
import { convertProtoUsageTransactions, getAeriocodeUris, getMainRole } from "./helpers"

type AccountViewProps = {
	aeriocodeUser: AeriocodeUser | null
	organizations: UserOrganization[] | null
	activeOrganization: UserOrganization | null
	onDone: () => void
}

type AeriocodeAccountViewProps = {
	aeriocodeUser: AeriocodeUser
	userOrganizations: UserOrganization[] | null
	activeOrganization: UserOrganization | null
}

type CachedData = {
	balance: number | null
	usageData: AeriocodeAccountUsageTransaction[]
	paymentsData: PaymentTransaction[]
	lastFetchTime: number
}

const AccountView = ({ onDone, aeriocodeUser, organizations, activeOrganization }: AccountViewProps) => {
	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden pt-[10px] pl-[20px]">
			<div className="flex justify-between items-center mb-[17px] pr-[17px]">
				<h3 className="text-[var(--vscode-foreground)] m-0">Account</h3>
				<VSCodeButton onClick={onDone}>Done</VSCodeButton>
			</div>
			<div className="flex-grow overflow-hidden pr-[8px] flex flex-col">
				<div className="h-full mb-[5px]">
					{aeriocodeUser?.uid ? (
						<AeriocodeAccountView
							aeriocodeUser={aeriocodeUser}
							userOrganizations={organizations}
							activeOrganization={activeOrganization}
						/>
					) : (
						<AccountWelcomeView />
					)}
				</div>
			</div>
		</div>
	)
}

export const AeriocodeAccountView = ({ aeriocodeUser, userOrganizations, activeOrganization }: AeriocodeAccountViewProps) => {
	console.log("DEBUG: AccountView received aeriocodeUser:", JSON.stringify(aeriocodeUser, null, 2))
	const { email, username, displayName, appBaseUrl, uid } = aeriocodeUser
	console.log("DEBUG: AccountView extracted username:", username)

	// Source of truth: Dedicated state for dropdown value that persists through failures
	// and represents that user's current selection.
	const [dropdownValue, setDropdownValue] = useState<string>(activeOrganization?.organizationId || uid)

	const [isLoading, setIsLoading] = useState(false)

	// Cache data per organization/user ID to avoid showing empty state when switching
	const dataCache = useRef<Map<string, CachedData>>(new Map())

	// Current displayed data
	const [balance, setBalance] = useState<number | null>(null)
	const [usageData, setUsageData] = useState<AeriocodeAccountUsageTransaction[]>([])
	const [paymentsData, setPaymentsData] = useState<PaymentTransaction[]>([])
	const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now())

	// Usage stats data
	const [usageStats, setUsageStats] = useState<{
		userId: string
		requestsToday: number
		requestsThisMonth: number
		tokensUsedToday: number
		tokensUsedThisMonth: number
		rateLimitRemaining: number
		rateLimitReset: number
		dailyLimit: number
		monthlyLimit: number
	} | null>(null)

	// Load cached data for current dropdown value
	const loadCachedData = useCallback((id: string) => {
		const cached = dataCache.current.get(id)
		if (cached) {
			setBalance(cached.balance)
			setUsageData(cached.usageData)
			setPaymentsData(cached.paymentsData)
			setLastFetchTime(cached.lastFetchTime)
			return true
		}
		return false
	}, [])

	// Simple cache function without dependencies
	const cacheCurrentData = (id: string) => {
		dataCache.current.set(id, {
			balance,
			usageData,
			paymentsData,
			lastFetchTime,
		})
	}
	// Track the active organization ID to detect changes
	const [lastActiveOrgId, setLastActiveOrgId] = useState<string | undefined>(activeOrganization?.organizationId)
	// Use ref for debounce timeout to avoid re-renders
	const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	// Track if manual fetch is in progress to avoid duplicate fetches
	const manualFetchInProgressRef = useRef<boolean>(false)

	const fetchUserCredit = useCallback(async () => {
		try {
			const response = await AccountServiceClient.getUserCredits(EmptyRequest.create())
			const newBalance = response?.balance?.currentBalance
			// Always update balance, even if it's 0 or null - don't skip undefined
			setBalance(newBalance ?? null)
			const newUsage = convertProtoUsageTransactions(response.usageTransactions)
			setUsageData((prev) => (deepEqual(newUsage, prev) ? prev : newUsage))
			const newPaymentsData = response.paymentTransactions
			setPaymentsData((prev) => (deepEqual(newPaymentsData, prev) ? prev : newPaymentsData))
		} catch (error) {
			console.error("Failed to fetch user credit:", error)
		}
	}, [])

	// biome-ignore lint/correctness/useExhaustiveDependencies: <cacheCurrentData changes on every re-render>
	const fetchCreditBalance = useCallback(
		async (id: string, skipCache = false) => {
			try {
				if (isLoading) return // Prevent multiple concurrent fetches

				// Load cached data immediately if available (unless skipping cache)
				if (!skipCache && loadCachedData(id)) {
					// If we have cached data, show it first, then fetch in background
				}

				setIsLoading(true)
				if (id === uid) {
					await fetchUserCredit()
				} else {
					const response = await AccountServiceClient.getOrganizationCredits({
						organizationId: id,
					})
					// Update balance - handle all values including 0 and null
					const newBalance = response.balance?.currentBalance
					setBalance(newBalance ?? null)

					const newUsage = convertProtoUsageTransactions(response.usageTransactions)
					setUsageData((prev) => (deepEqual(newUsage, prev) ? prev : newUsage))
				}

				// Cache the updated data
				cacheCurrentData(id)
			} catch (error) {
				console.error("Failed to fetch credit balance:", error)
			} finally {
				setLastFetchTime(Date.now())
				setIsLoading(false)
			}
		},
		[isLoading, uid, fetchUserCredit, loadCachedData],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: <cacheCurrentData changes on every re-render>
	const handleOrganizationChange = useCallback(
		async (event: any) => {
			const target = event.target as HTMLSelectElement
			if (!target) return

			const newValue = target.value
			if (newValue !== dropdownValue) {
				// Cache current data before switching
				cacheCurrentData(dropdownValue)
				setDropdownValue(newValue)
				// Load cached data for new selection immediately, or clear if no cache
				if (!loadCachedData(newValue)) {
					// No cached data - clear current state to avoid showing wrong data
					setBalance(null)
					setUsageData([])
					setPaymentsData([])
				}
			}
			// Set flag to indicate manual fetch in progress
			manualFetchInProgressRef.current = true
			await fetchCreditBalance(newValue)
			manualFetchInProgressRef.current = false
			// Send the change to the server
			const organizationId = newValue === uid ? undefined : newValue
			AccountServiceClient.setUserOrganization({ organizationId })
		},
		[uid, dropdownValue, loadCachedData],
	)

	// Fetch balance every 60 seconds
	useInterval(() => {
		fetchCreditBalance(dropdownValue)
	}, 60000)

	// Fetch usage stats
	const fetchUsageStats = useCallback(async () => {
		try {
			console.log("Fetching usage stats for account view...")
			const response = await AccountServiceClient.getUsageStats(EmptyRequest.create())
			console.log("Usage stats response for account view:", response)
			if (response) {
				setUsageStats({
					userId: response.userId,
					requestsToday: response.requestsToday,
					requestsThisMonth: response.requestsThisMonth,
					tokensUsedToday: response.tokensUsedToday,
					tokensUsedThisMonth: response.tokensUsedThisMonth,
					rateLimitRemaining: response.rateLimitRemaining,
					rateLimitReset: response.rateLimitReset,
					dailyLimit: response.dailyLimit,
					monthlyLimit: response.monthlyLimit,
				})
			}
		} catch (error) {
			console.error("Failed to fetch usage stats for account view:", error)
		}
	}, [])

	// Fetch usage stats on mount and when organization changes
	useEffect(() => {
		fetchUsageStats()
	}, [fetchUsageStats])

	const aeriocodeUrl = appBaseUrl || "https://app.aeriocode.bot"

	// Fetch balance on mount
	// biome-ignore lint/correctness/useExhaustiveDependencies: <Only run once on mount>
	useEffect(() => {
		async function initialFetch() {
			await fetchCreditBalance(dropdownValue)
		}
		initialFetch()
	}, [])

	// biome-ignore lint/correctness/useExhaustiveDependencies: <cacheCurrentData changes on every re-render>
	useEffect(() => {
		// Handle organization changes with 500ms debounce
		const currentActiveOrgId = activeOrganization?.organizationId
		const hasDropdownChanged = dropdownValue !== (currentActiveOrgId || uid)
		const hasActiveOrgChanged = currentActiveOrgId !== lastActiveOrgId

		if (hasDropdownChanged || hasActiveOrgChanged) {
			// Clear any existing timeout
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current)
			}

			// If dropdown changed, load cached data for the current dropdown value
			if (hasDropdownChanged) {
				// Cache the previous data first
				cacheCurrentData(lastActiveOrgId || uid)
				// Load cached data for current dropdown value, or clear if no cache
				if (!loadCachedData(dropdownValue)) {
					// No cached data - clear to avoid showing wrong data
					setBalance(null)
					setUsageData([])
					setPaymentsData([])
				}
			}

			// Only set timeout if manual fetch is not in progress
			if (!manualFetchInProgressRef.current) {
				// Set new timeout to fetch after 500ms
				debounceTimeoutRef.current = setTimeout(() => {
					fetchCreditBalance(dropdownValue)
					setLastActiveOrgId(currentActiveOrgId)
				}, 500)
			} else {
				// Manual fetch is handling this, just update the active org ID
				setLastActiveOrgId(currentActiveOrgId)
			}
		}

		// Cleanup timeout on unmount
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current)
			}
		}
	}, [dropdownValue, activeOrganization?.organizationId, lastActiveOrgId, uid])

	return (
		<div className="h-full flex flex-col">
			<div className="flex flex-col pr-3 h-full">
				<div className="flex flex-col w-full">
					<div className="flex items-center mb-6 flex-wrap gap-y-4">
						{/* {user.photoUrl ? (
								<img src={user.photoUrl} alt="Profile" className="size-16 rounded-full mr-4" />
							) : ( */}
						<div className="size-16 rounded-full bg-[var(--vscode-button-background)] flex items-center justify-center text-2xl text-[var(--vscode-button-foreground)] mr-4">
							{displayName?.[0] || email?.[0] || "?"}
						</div>
						{/* )} */}

						<div className="flex flex-col">
							{displayName && (
								<h2 className="text-[var(--vscode-foreground)] m-0 text-lg font-medium">{displayName}</h2>
							)}

							{email && <div className="text-sm text-[var(--vscode-descriptionForeground)]">{email}</div>}

							{username && (
								<div className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">@{username}</div>
							)}
						</div>
					</div>
				</div>

				<div className="w-full flex gap-2 flex-col min-[225px]:flex-row">
					<div className="w-full min-[225px]:w-1/2">
						<VSCodeButtonLink
							href={getAeriocodeUris(aeriocodeUrl, "dashboard").href}
							appearance="primary"
							className="w-full">
							Dashboard
						</VSCodeButtonLink>
					</div>
					<VSCodeButton appearance="secondary" onClick={() => handleSignOut()} className="w-full min-[225px]:w-1/2">
						Log out
					</VSCodeButton>
				</div>

				<VSCodeDivider className="w-full my-6" />

				<UsageBalance lastFetchTime={lastFetchTime} isLoading={isLoading} />

				<VSCodeDivider className="w-full my-6" />
			</div>
		</div>
	)
}

export default memo(AccountView)
