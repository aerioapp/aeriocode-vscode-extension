import { BannerAction, BannerCardData } from "@shared/aeriocode/banner"
import React from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"

interface WhatsNewModalProps {
	open: boolean
	onClose: () => void
	version: string
	welcomeBanners?: BannerCardData[]
	onBannerAction?: (action: BannerAction) => void
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ open, onClose, version, welcomeBanners, onBannerAction }) => {
	if (!open) {
		return null
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 1000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: "rgba(0, 0, 0, 0.5)",
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onClose()
				}
			}}>
			<div
				style={{
					backgroundColor: "var(--vscode-editor-background)",
					border: "1px solid var(--vscode-editorGroup-border)",
					borderRadius: "8px",
					padding: "20px",
					maxWidth: "500px",
					width: "90%",
					maxHeight: "80vh",
					overflow: "auto",
				}}>
				<h2
					style={{
						fontSize: "18px",
						fontWeight: "600",
						marginBottom: "12px",
						color: "var(--vscode-editor-foreground)",
					}}>
					New in v{version}
				</h2>

				<div style={{ color: "var(--vscode-foreground)", lineHeight: 1.6 }}>
					<p>Thank you for using AerioCode! This update includes improvements and bug fixes.</p>
				</div>

				<div style={{ marginTop: "16px", textAlign: "right" }}>
					<button
						onClick={onClose}
						style={{
							padding: "6px 16px",
							backgroundColor: "var(--vscode-button-background)",
							color: "var(--vscode-button-foreground)",
							border: "none",
							borderRadius: "4px",
							cursor: "pointer",
							fontSize: "13px",
						}}>
						Get Started
					</button>
				</div>
			</div>
		</div>
	)
}

export default WhatsNewModal
