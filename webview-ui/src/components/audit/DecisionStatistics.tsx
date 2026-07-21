import { memo, useEffect, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"

type DecisionStats = {
	total: number
	accepted: number
	modified: number
	rejected: number
	avgDecisionTimeMs: number
}

const DecisionStatistics = () => {
	const [stats, setStats] = useState<DecisionStats>({ total: 0, accepted: 0, modified: 0, rejected: 0, avgDecisionTimeMs: 0 })
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const fetchData = async () => {
			try {
				const response = await CertificationServiceClient.getDecisionStats(EmptyRequest.create({}))
				setStats({
					total: response.total,
					accepted: response.accepted,
					modified: response.modified,
					rejected: response.rejected,
					avgDecisionTimeMs: response.avgDecisionTimeMs,
				})
			} catch (error) {
				console.error("Failed to fetch decision stats:", error)
			} finally {
				setLoading(false)
			}
		}
		fetchData()
	}, [])

	const { total, accepted, modified, rejected, avgDecisionTimeMs } = stats

	const formatDuration = (ms: number) => {
		if (ms === 0) return "-"
		if (ms < 1000) return `${ms}ms`
		if (ms < 60000) return `${Math.round(ms / 1000)}s`
		return `${Math.round(ms / 60000)}m`
	}

	const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0

	if (loading) {
		return (
			<div className="flex justify-center items-center py-[40px] text-[var(--vscode-descriptionForeground)]">
				<span className="codicon codicon-loading codicon-modifier-spin" /> Loading...
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-[16px]">
			{/* Summary Cards */}
			<div className="grid grid-cols-2 gap-[8px]">
				<div className="p-[12px] border border-[var(--vscode-panel-border)] rounded">
					<div className="text-[24px] text-[var(--vscode-foreground)] font-bold">{total}</div>
					<div className="text-[11px] text-[var(--vscode-descriptionForeground)]">Total Decisions</div>
				</div>
				<div className="p-[12px] border border-[var(--vscode-panel-border)] rounded">
					<div className="text-[24px] text-[var(--vscode-testing-iconPassed)] font-bold">{acceptanceRate}%</div>
					<div className="text-[11px] text-[var(--vscode-descriptionForeground)]">Acceptance Rate</div>
				</div>
				<div className="p-[12px] border border-[var(--vscode-panel-border)] rounded">
					<div className="text-[24px] text-[var(--vscode-charts-yellow)] font-bold">{modified}</div>
					<div className="text-[11px] text-[var(--vscode-descriptionForeground)]">Modified</div>
				</div>
				<div className="p-[12px] border border-[var(--vscode-panel-border)] rounded">
					<div className="text-[24px] text-[var(--vscode-testing-iconFailed)] font-bold">{rejected}</div>
					<div className="text-[11px] text-[var(--vscode-descriptionForeground)]">Rejected</div>
				</div>
			</div>

			{/* Breakdown */}
			<div className="flex flex-col gap-[8px]">
				<h4 className="text-[12px] text-[var(--vscode-foreground)] m-0">Decision Breakdown</h4>
				<div className="flex flex-col gap-[6px]">
					{[
						{ label: "Accepted", count: accepted, color: "var(--vscode-testing-iconPassed)" },
						{ label: "Modified", count: modified, color: "var(--vscode-charts-yellow)" },
						{ label: "Rejected", count: rejected, color: "var(--vscode-testing-iconFailed)" },
					].map((item) => (
						<div key={item.label} className="flex items-center gap-[8px]">
							<span className="text-[12px] text-[var(--vscode-foreground)] w-[80px]">{item.label}</span>
							<div className="flex-grow h-[8px] bg-[var(--vscode-panel-border)] rounded overflow-hidden">
								<div
									className="h-full rounded transition-all"
									style={{
										width: total > 0 ? `${(item.count / total) * 100}%` : "0%",
										backgroundColor: item.color,
									}}
								/>
							</div>
							<span className="text-[11px] text-[var(--vscode-descriptionForeground)] w-[40px] text-right">
								{item.count}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Average Decision Time */}
			<div className="flex flex-col gap-[4px]">
				<h4 className="text-[12px] text-[var(--vscode-foreground)] m-0">Average Decision Time</h4>
				<span className="text-[13px] text-[var(--vscode-foreground)]">{formatDuration(avgDecisionTimeMs)}</span>
			</div>

			{total === 0 && (
				<div className="flex flex-col items-center justify-center py-[20px] text-[var(--vscode-descriptionForeground)]">
					<p className="text-[12px] m-0">No decision data available yet</p>
				</div>
			)}
		</div>
	)
}

export default memo(DecisionStatistics)
