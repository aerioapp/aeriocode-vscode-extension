import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useAeriocodeAuth } from "@/context/AeriocodeAuthContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { AccountServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { useEffect, useState } from "react"

export const AeriocodeAccountInfoCard = () => {
	const { aeriocodeUser } = useAeriocodeAuth()
	const { apiConfiguration, navigateToAccount } = useExtensionState()
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
	const [loading, setLoading] = useState(false)

	let user = apiConfiguration?.aeriocodeAccountId ? aeriocodeUser : undefined

	useEffect(() => {
		if (user) {
			fetchUsageStats()
		}
	}, [user])

	const fetchUsageStats = async () => {
		setLoading(true)
		try {
			console.log("Fetching usage stats from backend...")
			const response = await AccountServiceClient.getUsageStats(EmptyRequest.create())
			console.log("Usage stats response:", response)
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
					// Use the monthly limit from the backend response
					monthlyLimit: response.monthlyLimit,
					// Use the user-specific monthly reset time from the backend
					monthlyResetTime: response.rateLimitReset,
				})
			}
		} catch (error) {
			console.error("Failed to fetch usage stats:", error)
		} finally {
			setLoading(false)
		}
	}

	const handleLogin = () => {
		AccountServiceClient.accountLoginClicked(EmptyRequest.create()).catch((err) =>
			console.error("Failed to get login URL:", err),
		)
	}

	const handleShowAccount = () => {
		navigateToAccount()
	}

	const formatResetTime = (timestamp: number) => {
		const date = new Date(timestamp * 1000)
		return date.toLocaleTimeString()
	}

	return (
		<div className="max-w-[600px]">
			{user ? (
				<div className="space-y-4">
					{loading ? (
						<div className="text-sm text-vscode-descriptionForeground">Loading usage data...</div>
					) : usageStats ? (
						<div className="space-y-3 p-4 bg-vscode-editor-background rounded border border-vscode-panel-border">
							<h4 className="text-sm font-semibold text-vscode-foreground">API Usage</h4>

							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<div className="text-vscode-descriptionForeground">Monthly Usage</div>
									<div className="text-vscode-foreground font-medium">
										{usageStats.requestsThisMonth} /{" "}
										{usageStats.monthlyLimit === -1 ? "∞" : usageStats.monthlyLimit || "N/A"} requests
									</div>
								</div>
								<div>
									<div className="text-vscode-descriptionForeground">Remaining</div>
									<div className="text-vscode-foreground font-medium">
										{usageStats.rateLimitRemaining} requests
									</div>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<div className="text-vscode-descriptionForeground">Tokens This Month</div>
									<div className="text-vscode-foreground font-medium">
										{usageStats.tokensUsedThisMonth.toLocaleString()} tokens
									</div>
								</div>
								<div>
									<div className="text-vscode-descriptionForeground">Daily Usage</div>
									<div className="text-vscode-foreground font-medium">{usageStats.requestsToday} requests</div>
								</div>
							</div>

							<div className="text-xs text-vscode-descriptionForeground">
								Monthly reset:{" "}
								{usageStats.monthlyResetTime
									? new Date(usageStats.monthlyResetTime * 1000).toLocaleDateString()
									: "N/A"}
							</div>
						</div>
					) : (
						<div className="text-sm text-vscode-errorForeground">Failed to load usage data</div>
					)}

					<VSCodeButton appearance="secondary" onClick={handleShowAccount}>
						View Billing & Usage
					</VSCodeButton>
				</div>
			) : (
				<div>
					<VSCodeButton onClick={handleLogin} className="mt-0">
						Sign Up with Aeriocode
					</VSCodeButton>
				</div>
			)}
		</div>
	)
}
