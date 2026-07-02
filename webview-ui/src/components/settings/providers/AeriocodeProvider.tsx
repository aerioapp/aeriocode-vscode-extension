import { ApiConfiguration, ModelInfo } from "@shared/api"
import { AeriocodeAccountInfoCard } from "../AeriocodeAccountInfoCard"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { Mode } from "@shared/storage/types"
import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { useEffect, useState } from "react"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"
import { DropdownContainer } from "../ApiOptions"

interface ModelOption {
	id: string
	info: ModelInfo
}

/**
 * Props for the AeriocodeProvider component
 */
interface AeriocodeProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The Aeriocode provider configuration component
 */
export const AeriocodeProvider = ({ showModelOptions, isPopup, currentMode }: AeriocodeProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleModeFieldChange } = useApiConfigurationHandlers()
	const [availableModels, setAvailableModels] = useState<ModelOption[]>([])
	const [isLoadingModels, setIsLoadingModels] = useState(false)
	const [selectedModelId, setSelectedModelId] = useState<string>("")

	useEffect(() => {
		// Fetch available models when component mounts
		if (showModelOptions) {
			fetchAvailableModels()
		}
	}, [showModelOptions])

	useEffect(() => {
		// Update selected model ID when apiConfiguration changes
		const currentModelId = currentMode === "plan" ? apiConfiguration?.planModeApiModelId : apiConfiguration?.actModeApiModelId
		if (currentModelId) {
			setSelectedModelId(currentModelId)
		}
	}, [apiConfiguration, currentMode])

	const fetchAvailableModels = async () => {
		setIsLoadingModels(true)
		try {
			// For now, use hardcoded models since we can't dynamically import from main extension
			// This should be replaced with a proper message passing system to fetch models from the extension
			const modelOptions: ModelOption[] = [
				{
					id: "AerioCode",
					info: {
						maxTokens: 32000,
						contextWindow: 1_000_000,
						supportsImages: false,
						supportsPromptCache: false,
						inputPrice: 0,
						outputPrice: 0,
						description: "AerioCode general purpose coding assistant",
					},
				},
				{
					id: "AerioCode-DO178C",
					info: {
						maxTokens: 32000,
						contextWindow: 1_000_000,
						supportsImages: false,
						supportsPromptCache: false,
						inputPrice: 0,
						outputPrice: 0,
						description: "AerioCode specialized for DO-178C compliance",
					},
				},
				{
					id: "AerioCode-mini",
					info: {
						maxTokens: 32000,
						contextWindow: 1_000_000,
						supportsImages: false,
						supportsPromptCache: false,
						inputPrice: 0,
						outputPrice: 0,
						description: "AerioCode mini version",
					},
				},
			]

			setAvailableModels(modelOptions)

			// Set default model if none selected AND apiConfiguration doesn't have a model ID
			const currentModelId =
				currentMode === "plan" ? apiConfiguration?.planModeApiModelId : apiConfiguration?.actModeApiModelId
			if (modelOptions.length > 0 && !selectedModelId && !currentModelId) {
				const defaultModelId = modelOptions[0].id
				setSelectedModelId(defaultModelId)
				// Update the configuration
				handleModeFieldChange({ plan: "planModeApiModelId", act: "actModeApiModelId" }, defaultModelId, currentMode)
			}
		} catch (error) {
			console.error("Failed to fetch available models:", error)
			// Fall back to default models
			setAvailableModels([
				{
					id: "AerioCode",
					info: {
						maxTokens: 32000,
						contextWindow: 1_000_000,
						supportsImages: false,
						supportsPromptCache: false,
						inputPrice: 0,
						outputPrice: 0,
						description: "AerioCode general purpose coding assistant",
					},
				},
			])
		} finally {
			setIsLoadingModels(false)
		}
	}

	const handleModelChange = (modelId: string) => {
		setSelectedModelId(modelId)
		handleModeFieldChange({ plan: "planModeApiModelId", act: "actModeApiModelId" }, modelId, currentMode)
	}

	return (
		<div>
			{/* Aeriocode Account Info Card - only show when not in popup */}
			{!isPopup && (
				<div style={{ marginBottom: 14, marginTop: 4 }}>
					<AeriocodeAccountInfoCard />
				</div>
			)}

			{showModelOptions && (
				<div style={{ marginTop: 15 }}>
					<div style={{ marginBottom: "12px" }}>
						<strong>Model</strong>
					</div>
					{isLoadingModels ? (
						<div style={{ minHeight: "40px", display: "flex", alignItems: "center" }}>Loading models...</div>
					) : (
						<div style={{ position: "relative", zIndex: 10003, minHeight: "35px" }}>
							<VSCodeDropdown
								value={selectedModelId}
								onChange={(e: any) => handleModelChange(e.target.value)}
								style={{ minWidth: "200px", minHeight: "32px" }}>
								{availableModels.map((model) => (
									<VSCodeOption
										key={model.id}
										value={model.id}
										style={{ minHeight: "30px", padding: "5px 10px" }}>
										{model.id === "AerioCode"
											? "AerioCode"
											: model.id === "AerioCode-DO178C"
												? "AerioCode DO-178C"
												: model.id === "AerioCode-mini"
													? "AerioCode Mini"
													: model.id
															.replace(/-/g, " ")
															.replace(/\b\w/g, (letter) => letter.toUpperCase())}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
						</div>
					)}
					<div style={{ marginTop: "8px", fontSize: "0.8em", color: "#666", minHeight: "20px" }}>
						{availableModels.find((m) => m.id === selectedModelId)?.info.description || "Select a model"}
					</div>
				</div>
			)}
		</div>
	)
}
