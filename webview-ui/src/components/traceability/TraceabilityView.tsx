import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { memo, useState } from "react"
import TraceabilityMatrix from "./TraceabilityMatrix"
import RequirementList from "./RequirementList"
import UntracedCodeWarning from "./UntracedCodeWarning"

type TraceabilityViewProps = {
	onDone: () => void
}

type TabType = "matrix" | "requirements" | "untraced"

const TraceabilityView = ({ onDone }: TraceabilityViewProps) => {
	const [activeTab, setActiveTab] = useState<TabType>("matrix")

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden pt-[10px] pl-[20px]">
			<div className="flex justify-between items-center mb-[12px] pr-[17px]">
				<h3 className="text-[var(--vscode-foreground)] m-0">Traceability</h3>
				<VSCodeButton onClick={onDone}>Done</VSCodeButton>
			</div>

			{/* Tab Bar */}
			<div className="flex gap-[2px] mb-[12px] border-b border-[var(--vscode-panel-border)]">
				{[
					{ id: "matrix" as TabType, label: "Matrix" },
					{ id: "requirements" as TabType, label: "Requirements" },
					{ id: "untraced" as TabType, label: "Untraced Code" },
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
				{activeTab === "matrix" && <TraceabilityMatrix />}
				{activeTab === "requirements" && <RequirementList />}
				{activeTab === "untraced" && <UntracedCodeWarning />}
			</div>
		</div>
	)
}

export default memo(TraceabilityView)
