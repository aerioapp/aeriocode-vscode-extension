import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"

type IntegrityData = {
	valid: boolean
	totalEntries: number
	brokenAt: number
	lastChecked: string
}

const IntegrityStatus = () => {
	const [isVerifying, setIsVerifying] = useState(false)
	const [data, setData] = useState<IntegrityData>({ valid: true, totalEntries: 0, brokenAt: 0, lastChecked: "" })
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const fetchData = async () => {
			try {
				const response = await CertificationServiceClient.verifyIntegrity(EmptyRequest.create({}))
				setData({
					valid: response.valid,
					totalEntries: response.totalEntries,
					brokenAt: response.brokenAt,
					lastChecked: response.lastChecked,
				})
			} catch (error) {
				console.error("Failed to verify integrity:", error)
			} finally {
				setLoading(false)
			}
		}
		fetchData()
	}, [])

	const handleVerify = async () => {
		setIsVerifying(true)
		try {
			const response = await CertificationServiceClient.verifyIntegrity(EmptyRequest.create({}))
			setData({
				valid: response.valid,
				totalEntries: response.totalEntries,
				brokenAt: response.brokenAt,
				lastChecked: response.lastChecked,
			})
		} catch (error) {
			console.error("Failed to verify integrity:", error)
		} finally {
			setIsVerifying(false)
		}
	}

	if (loading) {
		return (
			<div className="flex justify-center items-center py-[40px] text-[var(--vscode-descriptionForeground)]">
				<span className="codicon codicon-loading codicon-modifier-spin" /> Loading...
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-[16px]">
			{/* Status Card */}
			<div
				className={`p-[16px] border rounded ${data.valid ? "border-[var(--vscode-testing-iconPassed)]" : "border-[var(--vscode-testing-iconFailed)]"}`}>
				<div className="flex items-center gap-[8px] mb-[8px]">
					<span
						className={`codicon codicon-${data.valid ? "check-all" : "warning"} text-[20px] ${data.valid ? "text-[var(--vscode-testing-iconPassed)]" : "text-[var(--vscode-testing-iconFailed)]"}`}
					/>
					<span className="text-[14px] text-[var(--vscode-foreground)] font-medium">
						{data.valid ? "Audit Trail Integrity Valid" : "Integrity Check Failed"}
					</span>
				</div>
				<div className="flex flex-col gap-[4px] text-[12px] text-[var(--vscode-descriptionForeground)]">
					<span>Total entries: {data.totalEntries}</span>
					{data.lastChecked && <span>Last verified: {new Date(data.lastChecked).toLocaleString()}</span>}
				</div>
			</div>

			{/* Verify Button */}
			<VSCodeButton onClick={handleVerify} disabled={isVerifying}>
				{isVerifying ? "Verifying..." : "Verify Integrity Now"}
			</VSCodeButton>

			{/* Info */}
			<div className="flex flex-col gap-[8px] p-[12px] border border-[var(--vscode-panel-border)] rounded text-[12px] text-[var(--vscode-descriptionForeground)]">
				<h4 className="text-[12px] text-[var(--vscode-foreground)] m-0">How It Works</h4>
				<ul className="m-0 pl-[16px]">
					<li>Each audit entry is SHA-256 hashed</li>
					<li>Each hash chains to the previous entry</li>
					<li>SQLite triggers prevent UPDATE/DELETE</li>
					<li>Tampering breaks the hash chain</li>
				</ul>
			</div>

			{data.totalEntries === 0 && (
				<div className="flex flex-col items-center justify-center py-[20px] text-[var(--vscode-descriptionForeground)]">
					<p className="text-[12px] m-0">No audit entries to verify yet</p>
				</div>
			)}
		</div>
	)
}

export default memo(IntegrityStatus)
