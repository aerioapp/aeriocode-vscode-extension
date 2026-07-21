import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { memo, useState } from "react"
import GenerationHistory from "./GenerationHistory"
import DecisionStatistics from "./DecisionStatistics"
import IntegrityStatus from "./IntegrityStatus"
import ExportPanel from "./ExportPanel"

type AuditTrailViewProps = {
	onDone: () => void
}

type TabType = "history" | "statistics" | "integrity" | "export"

const AuditTrailView = ({ onDone }: AuditTrailViewProps) => {
	const [activeTab, setActiveTab] = useState<TabType>("history")

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden pt-[10px] pl-[20px]">
			<div className="flex justify-between items-center mb-[12px] pr-[17px]">
				<h3 className="text-[var(--vscode-foreground)] m-0">Audit Trail</h3>
				<VSCodeButton onClick={onDone}>Done</VSCodeButton>
			</div>

			{/* Tab Bar */}
			<div className="flex gap-[2px] mb-[12px] border-b border-[var(--vscode-panel-border)]">
				{[
					{ id: "history" as TabType, label: "History" },
					{ id: "statistics" as TabType, label: "Statistics" },
					{ id: "integrity" as TabType, label: "Integrity" },
					{ id: "export" as TabType, label: "Export" },
				].map((tab) => (
					<button
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						className={`px-[12px] py-[6px] text-[12px] border-none cursor-pointer transition-colors ${
							activeTab === tab.id
								? "bg-[var(--vscode-panel-background)] text-[var(--vscode-foreground)] border-b-2 border-b-[var(--vscode-focusBorder)]"
								: "bg-transparent text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
						}`}>
						{tab.label}
					</button>
				))}
			</div>

			{/* Tab Content */}
			<div className="flex-grow overflow-auto pr-[8px]">
				{activeTab === "history" && <GenerationHistory />}
				{activeTab === "statistics" && <DecisionStatistics />}
				{activeTab === "integrity" && <IntegrityStatus />}
				{activeTab === "export" && <ExportPanel />}
			</div>
		</div>
	)
}

export default memo(AuditTrailView)
