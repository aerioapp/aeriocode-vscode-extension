import type React from "react"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import "../../../src/shared/webview/types"
import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import { findLastIndex } from "@shared/array"
import { DEFAULT_BROWSER_SETTINGS } from "@shared/BrowserSettings"
import { DEFAULT_PLATFORM, type ExtensionState } from "@shared/ExtensionMessage"
import { DEFAULT_MCP_DISPLAY_MODE } from "@shared/McpDisplayMode"
import type { UserInfo } from "@shared/proto/aeriocode/account"
import { EmptyRequest, StringRequest } from "@shared/proto/aeriocode/common"
import type { OpenRouterCompatibleModelInfo } from "@shared/proto/aeriocode/models"
import { type TerminalProfile, UpdateSettingsRequest } from "@shared/proto/aeriocode/state"
import { WebviewProviderType as WebviewProviderTypeEnum, WebviewProviderTypeRequest } from "@shared/proto/aeriocode/ui"
import { convertProtoToAeriocodeMessage } from "@shared/proto-conversions/aeriocode-message"
import { convertProtoMcpServersToMcpServers } from "@shared/proto-conversions/mcp/mcp-server-conversion"
import type { ModelInfo } from "../../../src/shared/api"
import type { McpMarketplaceCatalog, McpServer, McpViewTab } from "../../../src/shared/mcp"
import {
	CertificationServiceClient,
	FileServiceClient,
	McpServiceClient,
	ModelsServiceClient,
	StateServiceClient,
	UiServiceClient,
} from "../services/grpc-client"
import { convertTextMateToHljs } from "../utils/textMateToHljs"

interface ExtensionStateContextType extends ExtensionState {
	didHydrateState: boolean
	showWelcome: boolean
	theme: Record<string, string> | undefined
	// Aeriocode-only model support - other providers removed
	aeriocodeModels: Record<string, ModelInfo>
	mcpServers: McpServer[]
	mcpMarketplaceCatalog: McpMarketplaceCatalog
	filePaths: string[]
	totalTasksSize: number | null
	availableTerminalProfiles: TerminalProfile[]

	// View state
	showMcp: boolean
	mcpTab?: McpViewTab
	showSettings: boolean
	showHistory: boolean
	showAccount: boolean
	showTraceability: boolean
	showAuditTrail: boolean
	showProfileSetup: boolean
	showAnnouncement: boolean

	// Certification state
	certificationActive: boolean
	certificationProfile: string
	certificationLevel: string
	refreshCertificationStatus: () => void

	// Setters
	setShowAnnouncement: (value: boolean) => void
	setShouldShowAnnouncement: (value: boolean) => void
	setMcpServers: (value: McpServer[]) => void
	setGlobalAeriocodeRulesToggles: (toggles: Record<string, boolean>) => void
	setLocalAeriocodeRulesToggles: (toggles: Record<string, boolean>) => void
	setLocalCursorRulesToggles: (toggles: Record<string, boolean>) => void
	setLocalWindsurfRulesToggles: (toggles: Record<string, boolean>) => void
	setLocalWorkflowToggles: (toggles: Record<string, boolean>) => void
	setGlobalWorkflowToggles: (toggles: Record<string, boolean>) => void
	setMcpMarketplaceCatalog: (value: McpMarketplaceCatalog) => void
	setTotalTasksSize: (value: number | null) => void

	// Refresh functions - Aeriocode-only
	refreshAeriocodeModels: () => void
	setUserInfo: (userInfo?: UserInfo) => void

	// Navigation state setters
	setShowMcp: (value: boolean) => void
	setMcpTab: (tab?: McpViewTab) => void

	// Navigation functions
	navigateToMcp: (tab?: McpViewTab) => void
	navigateToSettings: () => void
	navigateToHistory: () => void
	navigateToAccount: () => void
	navigateToChat: () => void
	navigateToTraceability: () => void
	navigateToAuditTrail: () => void
	navigateToProfileSetup: () => void

	// Hide functions
	hideSettings: () => void
	hideHistory: () => void
	hideAccount: () => void
	hideTraceability: () => void
	hideAuditTrail: () => void
	hideProfileSetup: () => void
	hideAnnouncement: () => void
	closeMcpView: () => void

	// Event callbacks
	onRelinquishControl: (callback: () => void) => () => void
}

const ExtensionStateContext = createContext<ExtensionStateContextType | undefined>(undefined)

export const ExtensionStateContextProvider: React.FC<{
	children: React.ReactNode
}> = ({ children }) => {
	// Get the current webview provider type
	const currentProviderType =
		window.WEBVIEW_PROVIDER_TYPE === "sidebar" ? WebviewProviderTypeEnum.SIDEBAR : WebviewProviderTypeEnum.TAB
	// UI view state
	const [showMcp, setShowMcp] = useState(false)
	const [mcpTab, setMcpTab] = useState<McpViewTab | undefined>(undefined)
	const [showSettings, setShowSettings] = useState(false)
	const [showHistory, setShowHistory] = useState(false)
	const [showAccount, setShowAccount] = useState(false)
	const [showTraceability, setShowTraceability] = useState(false)
	const [showAuditTrail, setShowAuditTrail] = useState(false)
	const [showProfileSetup, setShowProfileSetup] = useState(false)
	const [showAnnouncement, setShowAnnouncement] = useState(false)

	// Helper for MCP view
	const closeMcpView = useCallback(() => {
		setShowMcp(false)
		setMcpTab(undefined)
	}, [setShowMcp, setMcpTab])

	// Hide functions
	const hideSettings = useCallback(() => setShowSettings(false), [setShowSettings])
	const hideHistory = useCallback(() => setShowHistory(false), [setShowHistory])
	const hideAccount = useCallback(() => setShowAccount(false), [setShowAccount])
	const hideAnnouncement = useCallback(() => setShowAnnouncement(false), [setShowAnnouncement])
	const hideTraceability = useCallback(() => setShowTraceability(false), [setShowTraceability])
	const hideAuditTrail = useCallback(() => setShowAuditTrail(false), [setShowAuditTrail])
	const hideProfileSetup = useCallback(() => setShowProfileSetup(false), [setShowProfileSetup])

	// Navigation functions
	const navigateToMcp = useCallback(
		(tab?: McpViewTab) => {
			setShowSettings(false)
			setShowHistory(false)
			setShowAccount(false)
			if (tab) {
				setMcpTab(tab)
			}
			setShowMcp(true)
		},
		[setShowMcp, setMcpTab, setShowSettings, setShowHistory, setShowAccount],
	)

	const navigateToSettings = useCallback(() => {
		setShowHistory(false)
		closeMcpView()
		setShowAccount(false)
		setShowSettings(true)
	}, [setShowSettings, setShowHistory, closeMcpView, setShowAccount])

	const navigateToHistory = useCallback(() => {
		setShowSettings(false)
		closeMcpView()
		setShowAccount(false)
		setShowHistory(true)
	}, [setShowSettings, closeMcpView, setShowAccount, setShowHistory])

	const navigateToAccount = useCallback(() => {
		setShowSettings(false)
		closeMcpView()
		setShowHistory(false)
		setShowAccount(true)
	}, [setShowSettings, closeMcpView, setShowHistory, setShowAccount])

	const navigateToChat = useCallback(() => {
		setShowSettings(false)
		closeMcpView()
		setShowHistory(false)
		setShowAccount(false)
		setShowTraceability(false)
		setShowAuditTrail(false)
		setShowProfileSetup(false)
	}, [
		setShowSettings,
		closeMcpView,
		setShowHistory,
		setShowAccount,
		setShowTraceability,
		setShowAuditTrail,
		setShowProfileSetup,
	])

	const navigateToTraceability = useCallback(() => {
		setShowSettings(false)
		closeMcpView()
		setShowHistory(false)
		setShowAccount(false)
		setShowAuditTrail(false)
		setShowProfileSetup(false)
		setShowTraceability(true)
	}, [
		setShowSettings,
		closeMcpView,
		setShowHistory,
		setShowAccount,
		setShowAuditTrail,
		setShowProfileSetup,
		setShowTraceability,
	])

	const navigateToAuditTrail = useCallback(() => {
		setShowSettings(false)
		closeMcpView()
		setShowHistory(false)
		setShowAccount(false)
		setShowTraceability(false)
		setShowProfileSetup(false)
		setShowAuditTrail(true)
	}, [
		setShowSettings,
		closeMcpView,
		setShowHistory,
		setShowAccount,
		setShowTraceability,
		setShowProfileSetup,
		setShowAuditTrail,
	])

	const navigateToProfileSetup = useCallback(() => {
		setShowSettings(false)
		closeMcpView()
		setShowHistory(false)
		setShowAccount(false)
		setShowTraceability(false)
		setShowAuditTrail(false)
		setShowProfileSetup(true)
	}, [
		setShowSettings,
		closeMcpView,
		setShowHistory,
		setShowAccount,
		setShowTraceability,
		setShowAuditTrail,
		setShowProfileSetup,
	])

	const [state, setState] = useState<ExtensionState>({
		version: "",
		aeriocodeMessages: [],
		taskHistory: [],
		shouldShowAnnouncement: false,
		autoApprovalSettings: DEFAULT_AUTO_APPROVAL_SETTINGS,
		browserSettings: DEFAULT_BROWSER_SETTINGS,
		preferredLanguage: "English",
		openaiReasoningEffort: "medium",
		mode: "act",
		platform: DEFAULT_PLATFORM,
		telemetrySetting: "unset",
		distinctId: "",
		planActSeparateModelsSetting: true,
		enableCheckpointsSetting: true,
		mcpDisplayMode: DEFAULT_MCP_DISPLAY_MODE,
		globalAeriocodeRulesToggles: {},
		localAeriocodeRulesToggles: {},
		localCursorRulesToggles: {},
		localWindsurfRulesToggles: {},
		localWorkflowToggles: {},
		globalWorkflowToggles: {},
		shellIntegrationTimeout: 4000,
		terminalReuseEnabled: true,
		terminalOutputLineLimit: 500,
		defaultTerminalProfile: "default",
		isNewUser: false,
		welcomeViewCompleted: false,
		mcpResponsesCollapsed: false, // Default value (expanded), will be overwritten by extension state
		strictPlanModeEnabled: false,
	})
	const [didHydrateState, setDidHydrateState] = useState(false)
	const [showWelcome, setShowWelcome] = useState(false)
	const [theme, setTheme] = useState<Record<string, string>>()
	const [filePaths, setFilePaths] = useState<string[]>([])
	// Aeriocode-only model support
	const [aeriocodeModels, setAeriocodeModels] = useState<Record<string, ModelInfo>>({})
	const [totalTasksSize, setTotalTasksSize] = useState<number | null>(null)
	const [availableTerminalProfiles, setAvailableTerminalProfiles] = useState<TerminalProfile[]>([])

	const [mcpServers, setMcpServers] = useState<McpServer[]>([])
	const [mcpMarketplaceCatalog, setMcpMarketplaceCatalog] = useState<McpMarketplaceCatalog>({ items: [] })

	// Certification state
	const [certificationActive, setCertificationActive] = useState(false)
	const [certificationProfile, setCertificationProfile] = useState("")
	const [certificationLevel, setCertificationLevel] = useState("")

	const refreshCertificationStatus = useCallback(async () => {
		try {
			const response = await CertificationServiceClient.getCertificationStatus(EmptyRequest.create({}))
			setCertificationActive(response.active)
			setCertificationProfile(response.profileStandard)
			setCertificationLevel(response.profileLevel)
		} catch (error) {
			console.error("[Certification] Failed to get status:", error)
			setCertificationActive(false)
			setCertificationProfile("")
			setCertificationLevel("")
		}
	}, [])

	// References to store subscription cancellation functions
	const stateSubscriptionRef = useRef<(() => void) | null>(null)

	// Reference for focusChatInput subscription
	const focusChatInputUnsubscribeRef = useRef<(() => void) | null>(null)
	const mcpButtonUnsubscribeRef = useRef<(() => void) | null>(null)
	const historyButtonClickedSubscriptionRef = useRef<(() => void) | null>(null)
	const chatButtonUnsubscribeRef = useRef<(() => void) | null>(null)
	const accountButtonClickedSubscriptionRef = useRef<(() => void) | null>(null)
	const settingsButtonClickedSubscriptionRef = useRef<(() => void) | null>(null)
	const partialMessageUnsubscribeRef = useRef<(() => void) | null>(null)
	const mcpMarketplaceUnsubscribeRef = useRef<(() => void) | null>(null)
	const themeSubscriptionRef = useRef<(() => void) | null>(null)
	const openRouterModelsUnsubscribeRef = useRef<(() => void) | null>(null)
	const workspaceUpdatesUnsubscribeRef = useRef<(() => void) | null>(null)
	const relinquishControlUnsubscribeRef = useRef<(() => void) | null>(null)

	// Certification button subscription refs
	const traceabilityButtonClickedSubscriptionRef = useRef<(() => void) | null>(null)
	const auditTrailButtonClickedSubscriptionRef = useRef<(() => void) | null>(null)

	// Add ref for callbacks
	const relinquishControlCallbacks = useRef<Set<() => void>>(new Set())

	// Create hook function
	const onRelinquishControl = useCallback((callback: () => void) => {
		relinquishControlCallbacks.current.add(callback)
		return () => {
			relinquishControlCallbacks.current.delete(callback)
		}
	}, [])
	const mcpServersSubscriptionRef = useRef<(() => void) | null>(null)
	const didBecomeVisibleUnsubscribeRef = useRef<(() => void) | null>(null)

	// Subscribe to state updates and UI events using the gRPC streaming API
	useEffect(() => {
		// Use the already defined webview provider type
		const webviewType = currentProviderType

		// Set up state subscription
		stateSubscriptionRef.current = StateServiceClient.subscribeToState(EmptyRequest.create({}), {
			onResponse: (response) => {
				if (response.stateJson) {
					try {
						const stateData = JSON.parse(response.stateJson) as ExtensionState
						setState((prevState) => {
							// Versioning logic for autoApprovalSettings
							const incomingVersion = stateData.autoApprovalSettings?.version ?? 1
							const currentVersion = prevState.autoApprovalSettings?.version ?? 1
							const shouldUpdateAutoApproval = incomingVersion > currentVersion

							const newState = {
								...stateData,
								autoApprovalSettings: shouldUpdateAutoApproval
									? stateData.autoApprovalSettings
									: prevState.autoApprovalSettings,
							}

							// Update welcome screen state based on API configuration
							setShowWelcome(!newState.welcomeViewCompleted)
							setDidHydrateState(true)

							console.log("[DEBUG] returning new state in ESC")

							return newState
						})
					} catch (error) {
						console.error("Error parsing state JSON:", error)
						console.log("[DEBUG] ERR getting state", error)
					}
				}
				console.log('[DEBUG] ended "got subscribed state"')
			},
			onError: (error) => {
				console.error("Error in state subscription:", error)
			},
			onComplete: () => {
				console.log("State subscription completed")
			},
		})

		// Subscribe to MCP button clicked events with webview type
		mcpButtonUnsubscribeRef.current = UiServiceClient.subscribeToMcpButtonClicked(
			WebviewProviderTypeRequest.create({
				providerType: webviewType,
			}),
			{
				onResponse: () => {
					console.log("[DEBUG] Received mcpButtonClicked event from gRPC stream")
					navigateToMcp()
				},
				onError: (error) => {
					console.error("Error in mcpButtonClicked subscription:", error)
				},
				onComplete: () => {
					console.log("mcpButtonClicked subscription completed")
				},
			},
		)

		// Set up history button clicked subscription with webview type
		historyButtonClickedSubscriptionRef.current = UiServiceClient.subscribeToHistoryButtonClicked(
			WebviewProviderTypeRequest.create({
				providerType: webviewType,
			}),
			{
				onResponse: () => {
					// When history button is clicked, navigate to history view
					console.log("[DEBUG] Received history button clicked event from gRPC stream")
					navigateToHistory()
				},
				onError: (error) => {
					console.error("Error in history button clicked subscription:", error)
				},
				onComplete: () => {
					console.log("History button clicked subscription completed")
				},
			},
		)

		// Subscribe to chat button clicked events with webview type
		chatButtonUnsubscribeRef.current = UiServiceClient.subscribeToChatButtonClicked(EmptyRequest.create({}), {
			onResponse: () => {
				// When chat button is clicked, navigate to chat
				console.log("[DEBUG] Received chat button clicked event from gRPC stream")
				navigateToChat()
			},
			onError: (error) => {
				console.error("Error in chat button subscription:", error)
			},
			onComplete: () => {},
		})

		// Subscribe to didBecomeVisible events
		didBecomeVisibleUnsubscribeRef.current = UiServiceClient.subscribeToDidBecomeVisible(EmptyRequest.create({}), {
			onResponse: () => {
				console.log("[DEBUG] Received didBecomeVisible event from gRPC stream")
				window.dispatchEvent(new CustomEvent("focusChatInput"))
			},
			onError: (error) => {
				console.error("Error in didBecomeVisible subscription:", error)
			},
			onComplete: () => {},
		})

		// Subscribe to MCP servers updates
		mcpServersSubscriptionRef.current = McpServiceClient.subscribeToMcpServers(EmptyRequest.create(), {
			onResponse: (response) => {
				console.log("[DEBUG] Received MCP servers update from gRPC stream")
				if (response.mcpServers) {
					setMcpServers(convertProtoMcpServersToMcpServers(response.mcpServers))
				}
			},
			onError: (error) => {
				console.error("Error in MCP servers subscription:", error)
			},
			onComplete: () => {
				console.log("MCP servers subscription completed")
			},
		})

		// Subscribe to workspace file updates
		workspaceUpdatesUnsubscribeRef.current = FileServiceClient.subscribeToWorkspaceUpdates(EmptyRequest.create({}), {
			onResponse: (response) => {
				console.log("[DEBUG] Received workspace update event from gRPC stream")
				setFilePaths(response.values || [])
			},
			onError: (error) => {
				console.error("Error in workspace updates subscription:", error)
			},
			onComplete: () => {},
		})

		// Set up settings button clicked subscription
		settingsButtonClickedSubscriptionRef.current = UiServiceClient.subscribeToSettingsButtonClicked(
			WebviewProviderTypeRequest.create({
				providerType: currentProviderType,
			}),
			{
				onResponse: () => {
					// When settings button is clicked, navigate to settings
					navigateToSettings()
				},
				onError: (error) => {
					console.error("Error in settings button clicked subscription:", error)
				},
				onComplete: () => {
					console.log("Settings button clicked subscription completed")
				},
			},
		)

		// Set up traceability button clicked subscription
		traceabilityButtonClickedSubscriptionRef.current = UiServiceClient.subscribeToTraceabilityButtonClicked(
			WebviewProviderTypeRequest.create({
				providerType: currentProviderType,
			}),
			{
				onResponse: () => {
					navigateToTraceability()
				},
				onError: (error) => {
					console.error("Error in traceability button clicked subscription:", error)
				},
				onComplete: () => {
					console.log("Traceability button clicked subscription completed")
				},
			},
		)

		// Set up audit trail button clicked subscription
		auditTrailButtonClickedSubscriptionRef.current = UiServiceClient.subscribeToAuditTrailButtonClicked(
			WebviewProviderTypeRequest.create({
				providerType: currentProviderType,
			}),
			{
				onResponse: () => {
					navigateToAuditTrail()
				},
				onError: (error) => {
					console.error("Error in audit trail button clicked subscription:", error)
				},
				onComplete: () => {
					console.log("Audit trail button clicked subscription completed")
				},
			},
		)

		// Subscribe to partial message events
		partialMessageUnsubscribeRef.current = UiServiceClient.subscribeToPartialMessage(EmptyRequest.create({}), {
			onResponse: (protoMessage) => {
				try {
					// Validate critical fields
					if (!protoMessage.ts || protoMessage.ts <= 0) {
						console.error("Invalid timestamp in partial message:", protoMessage)
						return
					}

					const partialMessage = convertProtoToAeriocodeMessage(protoMessage)
					setState((prevState) => {
						// worth noting it will never be possible for a more up-to-date message to be sent here or in normal messages post since the presentAssistantContent function uses lock
						const lastIndex = findLastIndex(prevState.aeriocodeMessages, (msg) => msg.ts === partialMessage.ts)
						if (lastIndex !== -1) {
							const newAeriocodeMessages = [...prevState.aeriocodeMessages]
							newAeriocodeMessages[lastIndex] = partialMessage
							return { ...prevState, aeriocodeMessages: newAeriocodeMessages }
						}
						return prevState
					})
				} catch (error) {
					console.error("Failed to process partial message:", error, protoMessage)
				}
			},
			onError: (error) => {
				console.error("Error in partialMessage subscription:", error)
			},
			onComplete: () => {
				console.log("[DEBUG] partialMessage subscription completed")
			},
		})

		// Subscribe to MCP marketplace catalog updates
		mcpMarketplaceUnsubscribeRef.current = McpServiceClient.subscribeToMcpMarketplaceCatalog(EmptyRequest.create({}), {
			onResponse: (catalog) => {
				console.log("[DEBUG] Received MCP marketplace catalog update from gRPC stream")
				setMcpMarketplaceCatalog(catalog)
			},
			onError: (error) => {
				console.error("Error in MCP marketplace catalog subscription:", error)
			},
			onComplete: () => {
				console.log("MCP marketplace catalog subscription completed")
			},
		})

		// Subscribe to theme changes
		themeSubscriptionRef.current = UiServiceClient.subscribeToTheme(EmptyRequest.create({}), {
			onResponse: (response) => {
				if (response.value) {
					try {
						const themeData = JSON.parse(response.value)
						setTheme(convertTextMateToHljs(themeData))
						console.log("[DEBUG] Received theme update from gRPC stream")
					} catch (error) {
						console.error("Error parsing theme data:", error)
					}
				}
			},
			onError: (error) => {
				console.error("Error in theme subscription:", error)
			},
			onComplete: () => {
				console.log("Theme subscription completed")
			},
		})

		// Subscribe to OpenRouter models updates - disabled for Aeriocode-only mode
		openRouterModelsUnsubscribeRef.current = ModelsServiceClient.subscribeToOpenRouterModels(EmptyRequest.create({}), {
			onResponse: (response: OpenRouterCompatibleModelInfo) => {
				console.log("[DEBUG] OpenRouter models subscription disabled - Aeriocode-only mode")
				// No-op: Aeriocode-only support
			},
			onError: (error) => {
				console.error("Error in OpenRouter models subscription:", error)
			},
			onComplete: () => {
				console.log("OpenRouter models subscription completed (disabled)")
			},
		})

		// Initialize webview using gRPC
		UiServiceClient.initializeWebview(EmptyRequest.create({}))
			.then(() => {
				console.log("[DEBUG] Webview initialization completed via gRPC")
			})
			.catch((error) => {
				console.error("Failed to initialize webview via gRPC:", error)
			})

		// Set up account button clicked subscription
		accountButtonClickedSubscriptionRef.current = UiServiceClient.subscribeToAccountButtonClicked(EmptyRequest.create(), {
			onResponse: () => {
				// When account button is clicked, navigate to account view
				console.log("[DEBUG] Received account button clicked event from gRPC stream")
				navigateToAccount()
			},
			onError: (error) => {
				console.error("Error in account button clicked subscription:", error)
			},
			onComplete: () => {
				console.log("Account button clicked subscription completed")
			},
		})

		// Fetch available terminal profiles on launch
		StateServiceClient.getAvailableTerminalProfiles(EmptyRequest.create({}))
			.then((response) => {
				setAvailableTerminalProfiles(response.profiles)
			})
			.catch((error) => {
				console.error("Failed to fetch available terminal profiles:", error)
			})

		// Fetch initial certification status
		refreshCertificationStatus()

		// Subscribe to relinquish control events
		relinquishControlUnsubscribeRef.current = UiServiceClient.subscribeToRelinquishControl(EmptyRequest.create({}), {
			onResponse: () => {
				// Call all registered callbacks
				relinquishControlCallbacks.current.forEach((callback) => callback())
			},
			onError: (error) => {
				console.error("Error in relinquishControl subscription:", error)
			},
			onComplete: () => {},
		})

		// Subscribe to focus chat input events
		const clientId = (window as any).aeriocodeClientId
		if (clientId) {
			const request = StringRequest.create({ value: clientId })
			focusChatInputUnsubscribeRef.current = UiServiceClient.subscribeToFocusChatInput(request, {
				onResponse: () => {
					// Dispatch a local DOM event within this webview only
					window.dispatchEvent(new CustomEvent("focusChatInput"))
				},
				onError: (error: Error) => {
					console.error("Error in focusChatInput subscription:", error)
				},
				onComplete: () => {},
			})
		} else {
			console.error("Client ID not found in window object")
		}

		// Clean up subscriptions when component unmounts
		return () => {
			if (stateSubscriptionRef.current) {
				stateSubscriptionRef.current()
				stateSubscriptionRef.current = null
			}
			if (mcpButtonUnsubscribeRef.current) {
				mcpButtonUnsubscribeRef.current()
				mcpButtonUnsubscribeRef.current = null
			}
			if (historyButtonClickedSubscriptionRef.current) {
				historyButtonClickedSubscriptionRef.current()
				historyButtonClickedSubscriptionRef.current = null
			}
			if (chatButtonUnsubscribeRef.current) {
				chatButtonUnsubscribeRef.current()
				chatButtonUnsubscribeRef.current = null
			}
			if (accountButtonClickedSubscriptionRef.current) {
				accountButtonClickedSubscriptionRef.current()
				accountButtonClickedSubscriptionRef.current = null
			}
			if (settingsButtonClickedSubscriptionRef.current) {
				settingsButtonClickedSubscriptionRef.current()
				settingsButtonClickedSubscriptionRef.current = null
			}
			if (traceabilityButtonClickedSubscriptionRef.current) {
				traceabilityButtonClickedSubscriptionRef.current()
				traceabilityButtonClickedSubscriptionRef.current = null
			}
			if (auditTrailButtonClickedSubscriptionRef.current) {
				auditTrailButtonClickedSubscriptionRef.current()
				auditTrailButtonClickedSubscriptionRef.current = null
			}
			if (partialMessageUnsubscribeRef.current) {
				partialMessageUnsubscribeRef.current()
				partialMessageUnsubscribeRef.current = null
			}
			if (mcpMarketplaceUnsubscribeRef.current) {
				mcpMarketplaceUnsubscribeRef.current()
				mcpMarketplaceUnsubscribeRef.current = null
			}
			if (themeSubscriptionRef.current) {
				themeSubscriptionRef.current()
				themeSubscriptionRef.current = null
			}
			if (openRouterModelsUnsubscribeRef.current) {
				openRouterModelsUnsubscribeRef.current()
				openRouterModelsUnsubscribeRef.current = null
			}
			if (workspaceUpdatesUnsubscribeRef.current) {
				workspaceUpdatesUnsubscribeRef.current()
				workspaceUpdatesUnsubscribeRef.current = null
			}
			if (relinquishControlUnsubscribeRef.current) {
				relinquishControlUnsubscribeRef.current()
				relinquishControlUnsubscribeRef.current = null
			}
			if (focusChatInputUnsubscribeRef.current) {
				focusChatInputUnsubscribeRef.current()
				focusChatInputUnsubscribeRef.current = null
			}
			if (mcpServersSubscriptionRef.current) {
				mcpServersSubscriptionRef.current()
				mcpServersSubscriptionRef.current = null
			}
			if (didBecomeVisibleUnsubscribeRef.current) {
				didBecomeVisibleUnsubscribeRef.current()
				didBecomeVisibleUnsubscribeRef.current = null
			}
		}
	}, [])

	const refreshAeriocodeModels = useCallback(() => {
		// Aeriocode models are managed by the extension - no refresh needed
		console.log("Aeriocode models refresh - managed by extension")
	}, [])

	const contextValue: ExtensionStateContextType = {
		...state,
		didHydrateState,
		showWelcome,
		theme,
		aeriocodeModels,
		mcpServers,
		mcpMarketplaceCatalog,
		filePaths,
		totalTasksSize,
		availableTerminalProfiles,
		showMcp,
		mcpTab,
		showSettings,
		showHistory,
		showAccount,
		showTraceability,
		showAuditTrail,
		showProfileSetup,
		showAnnouncement,
		certificationActive,
		certificationProfile,
		certificationLevel,
		refreshCertificationStatus,
		globalAeriocodeRulesToggles: state.globalAeriocodeRulesToggles || {},
		localAeriocodeRulesToggles: state.localAeriocodeRulesToggles || {},
		localCursorRulesToggles: state.localCursorRulesToggles || {},
		localWindsurfRulesToggles: state.localWindsurfRulesToggles || {},
		localWorkflowToggles: state.localWorkflowToggles || {},
		globalWorkflowToggles: state.globalWorkflowToggles || {},
		enableCheckpointsSetting: state.enableCheckpointsSetting,

		// Navigation functions
		navigateToMcp,
		navigateToSettings,
		navigateToHistory,
		navigateToAccount,
		navigateToChat,
		navigateToTraceability,
		navigateToAuditTrail,
		navigateToProfileSetup,

		// Hide functions
		hideSettings,
		hideHistory,
		hideAccount,
		hideTraceability,
		hideAuditTrail,
		hideProfileSetup,
		hideAnnouncement,
		setShowAnnouncement,
		setShouldShowAnnouncement: (value) =>
			setState((prevState) => ({
				...prevState,
				shouldShowAnnouncement: value,
			})),
		setMcpServers: (mcpServers: McpServer[]) => setMcpServers(mcpServers),
		setMcpMarketplaceCatalog: (catalog: McpMarketplaceCatalog) => setMcpMarketplaceCatalog(catalog),
		setShowMcp,
		closeMcpView,
		setGlobalAeriocodeRulesToggles: (toggles) =>
			setState((prevState) => ({
				...prevState,
				globalAeriocodeRulesToggles: toggles,
			})),
		setLocalAeriocodeRulesToggles: (toggles) =>
			setState((prevState) => ({
				...prevState,
				localAeriocodeRulesToggles: toggles,
			})),
		setLocalCursorRulesToggles: (toggles) =>
			setState((prevState) => ({
				...prevState,
				localCursorRulesToggles: toggles,
			})),
		setLocalWindsurfRulesToggles: (toggles) =>
			setState((prevState) => ({
				...prevState,
				localWindsurfRulesToggles: toggles,
			})),
		setLocalWorkflowToggles: (toggles) =>
			setState((prevState) => ({
				...prevState,
				localWorkflowToggles: toggles,
			})),
		setGlobalWorkflowToggles: (toggles) =>
			setState((prevState) => ({
				...prevState,
				globalWorkflowToggles: toggles,
			})),
		setMcpTab,
		setTotalTasksSize,
		refreshAeriocodeModels,
		onRelinquishControl,
		setUserInfo: (userInfo?: UserInfo) => setState((prevState) => ({ ...prevState, userInfo })),
	}

	return <ExtensionStateContext.Provider value={contextValue}>{children}</ExtensionStateContext.Provider>
}

export const useExtensionState = () => {
	const context = useContext(ExtensionStateContext)
	if (context === undefined) {
		throw new Error("useExtensionState must be used within an ExtensionStateContextProvider")
	}
	return context
}
