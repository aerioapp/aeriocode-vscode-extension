import { useExtensionState } from "@/context/ExtensionStateContext"
import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { useCallback, useEffect, useState } from "react"
import styled from "styled-components"
import { normalizeApiConfiguration } from "@/components/settings/utils/providerUtils"
import { AeriocodeProvider } from "./providers/AeriocodeProvider"
import { useApiConfigurationHandlers } from "./utils/useApiConfigurationHandlers"
import { Mode } from "@shared/storage/types"

interface ApiOptionsProps {
	showModelOptions: boolean
	apiErrorMessage?: string
	modelIdErrorMessage?: string
	isPopup?: boolean
	currentMode: Mode
}

// This is necessary to ensure dropdown opens downward, important for when this is used in popup
export const DROPDOWN_Z_INDEX = 10001 // Increased z-index to ensure it appears above other elements

export const DropdownContainer = styled.div<{ zIndex?: number }>`
	position: relative;
	z-index: ${(props) => props.zIndex || DROPDOWN_Z_INDEX};

	// Force dropdowns to open downward and ensure they appear above other elements
	& vscode-dropdown::part(listbox) {
		position: absolute !important;
		top: 100% !important;
		bottom: auto !important;
		z-index: 10002 !important; // Ensure dropdown options appear above other elements
	}
`

const ApiOptions = ({ showModelOptions, apiErrorMessage, modelIdErrorMessage, isPopup, currentMode }: ApiOptionsProps) => {
	// Use full context state for immediate save payload
	const { apiConfiguration } = useExtensionState()

	const { selectedProvider } = normalizeApiConfiguration(apiConfiguration, currentMode)

	const { handleModeFieldChange } = useApiConfigurationHandlers()

	// Since we're only supporting Aeriocode, this is much simpler
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: isPopup ? -10 : 0 }}>
			<DropdownContainer className="dropdown-container">
				<label htmlFor="api-provider">
					<span style={{ fontWeight: 500 }}>API Provider</span>
				</label>
				<VSCodeDropdown
					id="api-provider"
					value={selectedProvider}
					onChange={(e: any) => {
						handleModeFieldChange(
							{ plan: "planModeApiProvider", act: "actModeApiProvider" },
							e.target.value,
							currentMode,
						)
					}}
					style={{
						minWidth: 130,
						position: "relative",
					}}>
					<VSCodeOption value="aeriocode">Aeriocode</VSCodeOption>
				</VSCodeDropdown>
			</DropdownContainer>

			{apiConfiguration && selectedProvider === "aeriocode" && (
				<AeriocodeProvider showModelOptions={showModelOptions} isPopup={isPopup} currentMode={currentMode} />
			)}

			{apiErrorMessage && (
				<p
					style={{
						margin: "-10px 0 4px 0",
						fontSize: 12,
						color: "var(--vscode-errorForeground)",
					}}>
					{apiErrorMessage}
				</p>
			)}
			{modelIdErrorMessage && (
				<p
					style={{
						margin: "-10px 0 4px 0",
						fontSize: 12,
						color: "var(--vscode-errorForeground)",
					}}>
					{modelIdErrorMessage}
				</p>
			)}
		</div>
	)
}

export default ApiOptions
