import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useEffect, useState } from "react"
import { AccountServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import VSCodeButtonLink from "../common/VSCodeButtonLink"

type UsageBalanceProps = {
	lastFetchTime: number
	isLoading: boolean
}

export const UsageBalance = ({ lastFetchTime, isLoading }: UsageBalanceProps) => {
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
		monthlyResetTime?: number
	} | null>(null)

	const fetchUsageStats = async () => {
		try {
			console.log("Fetching usage stats for usage balance component...")
			const response = await AccountServiceClient.getUsageStats(EmptyRequest.create())
			console.log("Usage stats response for usage balance:", response)
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
					// Use the monthly limit from the backend response if available, otherwise calculate defaults
					monthlyLimit: response.monthlyLimit,
					// Use the user-specific monthly reset time from the backend
					monthlyResetTime: response.rateLimitReset,
				})
			}
		} catch (error) {
			console.error("Failed to fetch usage stats for usage balance:", error)
		}
	}

	useEffect(() => {
		fetchUsageStats()
	}, [])

	const handleRefresh = () => {
		fetchUsageStats()
	}

	return (
		<div
			className="w-full flex flex-col items-center"
			title={`Last updated: ${new Date(lastFetchTime).toLocaleTimeString()}`}>
			<div className="text-sm text-[var(--vscode-descriptionForeground)] mb-3 font-azeret-mono font-light">API USAGE</div>

			{usageStats ? (
				<div className="w-full space-y-4 mb-6">
					<div className="text-center">
						<div className="text-3xl font-bold text-[var(--vscode-foreground)] mb-2">
							{usageStats.requestsThisMonth}/{usageStats.monthlyLimit === -1 ? "∞" : usageStats.monthlyLimit}
						</div>
						<div className="text-sm text-[var(--vscode-descriptionForeground)]">
							{usageStats.rateLimitRemaining} remaining this month
						</div>
					</div>

					<div className="text-center text-xs text-[var(--vscode-descriptionForeground)]">
						Monthly reset:{" "}
						{usageStats.monthlyResetTime ? new Date(usageStats.monthlyResetTime * 1000).toLocaleDateString() : "N/A"}
					</div>
				</div>
			) : (
				<div className="text-4xl font-bold text-[var(--vscode-foreground)] mb-6">----</div>
			)}

			<div className="flex items-center justify-center gap-2">
				{usageStats ? (
					<div className="text-lg text-[var(--vscode-foreground)]">
						{usageStats.requestsThisMonth} requests this month
					</div>
				) : (
					<div className="text-lg text-[var(--vscode-foreground)]">----</div>
				)}
				<VSCodeButton
					appearance="icon"
					className={`mt-1 ${isLoading ? "animate-spin" : ""}`}
					onClick={handleRefresh}
					disabled={isLoading}>
					<span className="codicon codicon-refresh"></span>
				</VSCodeButton>
			</div>
		</div>
	)
}
