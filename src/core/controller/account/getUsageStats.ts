import type { Controller } from "../index"
import type { EmptyRequest } from "@shared/proto/aeriocode/common"
import { UsageStatsResponse } from "@shared/proto/aeriocode/account"

/**
 * Handles fetching usage statistics from the backend API
 * @param controller The controller instance
 * @param request Empty request
 * @returns Usage statistics response
 */
export async function getUsageStats(controller: Controller, request: EmptyRequest): Promise<UsageStatsResponse> {
	try {
		if (!controller.accountService) {
			throw new Error("Account service not available")
		}

		console.log("Fetching usage stats from backend API...")
		// Call the RPC variant to fetch usage stats
		const usageStats = await controller.accountService.fetchUsageStatsRPC()

		// If the call fails (returns undefined), throw an error
		if (usageStats === undefined) {
			console.error("Usage stats fetch returned undefined")
			throw new Error("Failed to fetch usage statistics")
		}

		console.log("Usage stats fetched successfully:", usageStats)
		return UsageStatsResponse.create({
			userId: usageStats.user_id,
			requestsToday: usageStats.requests_today,
			requestsThisMonth: usageStats.requests_this_month,
			tokensUsedToday: usageStats.tokens_used_today,
			tokensUsedThisMonth: usageStats.tokens_used_this_month,
			rateLimitRemaining: usageStats.rate_limit_remaining,
			rateLimitReset: usageStats.rate_limit_reset,
			dailyLimit: usageStats.daily_limit,
			monthlyLimit: usageStats.monthly_limit,
		})
	} catch (error) {
		console.error(`Failed to fetch usage statistics: ${error}`)
		throw error
	}
}
