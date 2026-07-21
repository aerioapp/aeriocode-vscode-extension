import type { Boolean, EmptyRequest } from "@shared/proto/aeriocode/common"
import { useEffect } from "react"
import AccountView from "./components/account/AccountView"
import ChatView from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import McpView from "./components/mcp/configuration/McpConfigurationView"
import SettingsView from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"
import TraceabilityView from "./components/traceability/TraceabilityView"
import AuditTrailView from "./components/audit/AuditTrailView"
import ProfileSetup from "./components/certification/ProfileSetup"
import { useAeriocodeAuth } from "./context/AeriocodeAuthContext"
import { useExtensionState } from "./context/ExtensionStateContext"
import { Providers } from "./Providers"
import { CertificationServiceClient, UiServiceClient } from "./services/grpc-client"
import { ActivateProfileRequest } from "@shared/proto/aeriocode/certification"

const AppContent = () => {
	const {
		didHydrateState,
		showWelcome,
		shouldShowAnnouncement,
		showMcp,
		mcpTab,
		showSettings,
		showHistory,
		showAccount,
		showTraceability,
		showAuditTrail,
		showProfileSetup,
		showAnnouncement,
		setShowAnnouncement,
		setShouldShowAnnouncement,
		closeMcpView,
		navigateToHistory,
		navigateToTraceability,
		navigateToAuditTrail,
		hideSettings,
		hideHistory,
		hideAccount,
		hideTraceability,
		hideAuditTrail,
		hideProfileSetup,
		hideAnnouncement,
		refreshCertificationStatus,
	} = useExtensionState()

	const { aeriocodeUser, organizations, activeOrganization } = useAeriocodeAuth()

	useEffect(() => {
		if (shouldShowAnnouncement) {
			setShowAnnouncement(true)

			// Use the gRPC client instead of direct WebviewMessage
			UiServiceClient.onDidShowAnnouncement({} as EmptyRequest)
				.then((response: Boolean) => {
					setShouldShowAnnouncement(response.value)
				})
				.catch((error) => {
					console.error("Failed to acknowledge announcement:", error)
				})
		}
	}, [shouldShowAnnouncement, setShouldShowAnnouncement, setShowAnnouncement])

	if (!didHydrateState) {
		return null
	}

	// Show welcome page when user is not signed in
	if (!aeriocodeUser) {
		return <WelcomeView />
	}

	return (
		<div className="flex h-screen w-full flex-col">
			{/* Only render main views when a user is signed in */}
			{aeriocodeUser && (
				<>
					{showSettings && <SettingsView onDone={hideSettings} />}
					{showHistory && <HistoryView onDone={hideHistory} />}
					{showMcp && <McpView initialTab={mcpTab} onDone={closeMcpView} />}
					{showAccount && (
						<AccountView
							onDone={hideAccount}
							aeriocodeUser={aeriocodeUser}
							organizations={organizations}
							activeOrganization={activeOrganization}
						/>
					)}
					{showTraceability && <TraceabilityView onDone={hideTraceability} />}
					{showAuditTrail && <AuditTrailView onDone={hideAuditTrail} />}
					{showProfileSetup && (
						<ProfileSetup
							onSetup={async (standard, level) => {
								try {
									await CertificationServiceClient.activateProfile(
										ActivateProfileRequest.create({ standard, level }),
									)
									await refreshCertificationStatus()
									hideProfileSetup()
									navigateToTraceability()
								} catch (error) {
									console.error("Failed to activate certification profile:", error)
								}
							}}
							onSkip={hideProfileSetup}
						/>
					)}
					{/* Do not conditionally load ChatView, it's expensive and there's state we don't want to lose (user input, disableInput, askResponse promise, etc.) */}
					<ChatView
						showHistoryView={navigateToHistory}
						isHidden={
							showSettings ||
							showHistory ||
							showMcp ||
							showAccount ||
							showTraceability ||
							showAuditTrail ||
							showProfileSetup
						}
						showAnnouncement={showAnnouncement}
						hideAnnouncement={hideAnnouncement}
					/>
				</>
			)}
		</div>
	)
}

const App = () => {
	return (
		<Providers>
			<AppContent />
		</Providers>
	)
}

export default App
