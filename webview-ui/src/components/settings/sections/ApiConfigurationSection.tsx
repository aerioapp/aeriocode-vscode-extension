import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { TabButton } from "../../mcp/configuration/McpConfigurationView"
import ApiOptions from "../ApiOptions"
import Section from "../Section"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { StateServiceClient } from "@/services/grpc-client"
import { UpdateSettingsRequest } from "@shared/proto/aeriocode/state"
import { useState } from "react"
import { syncModeConfigurations } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"
import { Mode } from "@shared/storage/types"
interface ApiConfigurationSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const ApiConfigurationSection = ({ renderSectionHeader }: ApiConfigurationSectionProps) => {
	const { planActSeparateModelsSetting, mode, apiConfiguration } = useExtensionState()
	const [currentTab, setCurrentTab] = useState<Mode>(mode)
	const { handleFieldsChange } = useApiConfigurationHandlers()
	return (
		<div>
			{renderSectionHeader("api-config")}
			<Section>
				{/* Tabs container */}
				{planActSeparateModelsSetting ? (
					<div className="rounded-md mb-5 bg-[var(--vscode-panel-background)]">
						<div className="flex gap-[1px] mb-[10px] -mt-2 border-0 border-b border-solid border-[var(--vscode-panel-border)]">
							<TabButton
								isActive={currentTab === "plan"}
								onClick={() => setCurrentTab("plan")}
								disabled={currentTab === "plan"}
								style={{
									opacity: 1,
									cursor: "pointer",
								}}>
								Plan Mode
							</TabButton>
							<TabButton
								isActive={currentTab === "act"}
								onClick={() => setCurrentTab("act")}
								disabled={currentTab === "act"}
								style={{
									opacity: 1,
									cursor: "pointer",
								}}>
								Act Mode
							</TabButton>
						</div>

						{/* Content container */}
						<div className="-mb-3">
							<ApiOptions showModelOptions={true} currentMode={currentTab} />
						</div>
					</div>
				) : (
					<ApiOptions showModelOptions={true} currentMode={mode} />
				)}
			</Section>
		</div>
	)
}

export default ApiConfigurationSection
