import { memo, useEffect, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"

type CertificationStatusBarProps = {
	onClick: () => void
}

const CertificationStatusBar = ({ onClick }: CertificationStatusBarProps) => {
	const [status, setStatus] = useState<{
		active: boolean
		profileStandard: string
		profileLevel: string
		coveragePercent: number
	}>({ active: false, profileStandard: "", profileLevel: "", coveragePercent: 0 })
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const fetchData = async () => {
			try {
				const response = await CertificationServiceClient.getCertificationStatus(EmptyRequest.create({}))
				setStatus({
					active: response.active,
					profileStandard: response.profileStandard,
					profileLevel: response.profileLevel,
					coveragePercent: response.coveragePercent,
				})
			} catch (error) {
				console.error("Failed to fetch certification status:", error)
			} finally {
				setLoading(false)
			}
		}
		fetchData()
	}, [])

	if (loading) {
		return null
	}

	if (!status.active || !status.profileStandard) {
		return (
			<div
				className="flex items-center gap-[6px] px-[8px] py-[4px] text-[11px] text-[var(--vscode-descriptionForeground)] cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] rounded"
				onClick={onClick}>
				<span className="codicon codicon-shield" />
				<span>Certification: Not configured</span>
			</div>
		)
	}

	const coverageColor =
		status.coveragePercent >= 80
			? "var(--vscode-testing-iconPassed)"
			: status.coveragePercent >= 50
				? "var(--vscode-charts-yellow)"
				: "var(--vscode-testing-iconFailed)"

	return (
		<div
			className="flex items-center gap-[6px] px-[8px] py-[4px] text-[11px] cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] rounded"
			onClick={onClick}>
			<span className="codicon codicon-shield text-[var(--vscode-focusBorder)]" />
			<span className="text-[var(--vscode-foreground)]">{status.profileStandard}</span>
			{status.profileLevel && <span className="text-[var(--vscode-descriptionForeground)]">{status.profileLevel}</span>}
			<span
				className="text-[10px] px-[4px] py-[1px] rounded"
				style={{ color: coverageColor, backgroundColor: `${coverageColor}20` }}>
				{status.coveragePercent}% traced
			</span>
		</div>
	)
}

export default memo(CertificationStatusBar)
