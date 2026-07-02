import * as vscode from "vscode"
import { Mode, OpenaiReasoningEffort } from "@shared/storage/types"
import { DEFAULT_BROWSER_SETTINGS } from "@shared/BrowserSettings"
import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import { GlobalStateKey, LocalStateKey, SecretKey } from "./state-keys"
import { ApiConfiguration, ApiProvider, ModelInfo } from "@shared/api"
import { HistoryItem } from "@shared/HistoryItem"
import { AutoApprovalSettings } from "@shared/AutoApprovalSettings"
import { BrowserSettings } from "@shared/BrowserSettings"
import { TelemetrySetting } from "@shared/TelemetrySetting"
import { UserInfo } from "@shared/UserInfo"
import { AeriocodeRulesToggles } from "@shared/aeriocode-rules"
import { DEFAULT_MCP_DISPLAY_MODE, McpDisplayMode } from "@shared/McpDisplayMode"
import { migrateEnableCheckpointsSetting, migrateMcpMarketplaceEnableSetting } from "./state-migrations"
import { Controller } from "../controller"
/*
	Storage
	https://dev.to/kompotkot/how-to-use-secretstorage-in-your-vscode-extensions-2hco
	https://www.eliostruyf.com/devhack-code-extension-storage-options/
	*/

const isTemporaryProfile = process.env.TEMP_PROFILE === "true"

// In-memory storage for temporary profiles
const inMemoryGlobalState = new Map<string, any>()
const inMemoryWorkspaceState = new Map<string, any>()
const inMemorySecrets = new Map<string, string>()

// global
export async function updateGlobalState(context: vscode.ExtensionContext, key: GlobalStateKey, value: any) {
	if (isTemporaryProfile) {
		inMemoryGlobalState.set(key, value)
		return
	}
	await context.globalState.update(key, value)
}

export async function getGlobalState(context: vscode.ExtensionContext, key: GlobalStateKey) {
	if (isTemporaryProfile) {
		return inMemoryGlobalState.get(key)
	}
	return await context.globalState.get(key)
}

// Batched operations for performance optimization
export async function updateGlobalStateBatch(context: vscode.ExtensionContext, updates: Record<string, any>) {
	if (isTemporaryProfile) {
		Object.entries(updates).forEach(([key, value]) => {
			inMemoryGlobalState.set(key, value)
		})
		return
	}
	// Use Promise.all to batch the updates
	await Promise.all(Object.entries(updates).map(([key, value]) => context.globalState.update(key as GlobalStateKey, value)))
}

export async function updateSecretsBatch(context: vscode.ExtensionContext, updates: Record<string, string | undefined>) {
	if (isTemporaryProfile) {
		Object.entries(updates).forEach(([key, value]) => {
			if (value) {
				inMemorySecrets.set(key, value)
			} else {
				inMemorySecrets.delete(key)
			}
		})
		return
	}
	// Use Promise.all to batch the secret updates
	await Promise.all(Object.entries(updates).map(([key, value]) => storeSecret(context, key as SecretKey, value)))
}

// secrets
export async function storeSecret(context: vscode.ExtensionContext, key: SecretKey, value?: string) {
	if (isTemporaryProfile) {
		if (value) {
			inMemorySecrets.set(key, value)
		} else {
			inMemorySecrets.delete(key)
		}
		return
	}
	if (value) {
		await context.secrets.store(key, value)
	} else {
		await context.secrets.delete(key)
	}
}

export async function getSecret(context: vscode.ExtensionContext, key: SecretKey) {
	if (isTemporaryProfile) {
		return inMemorySecrets.get(key)
	}
	return await context.secrets.get(key)
}

// workspace
export async function updateWorkspaceState(context: vscode.ExtensionContext, key: LocalStateKey, value: any) {
	if (isTemporaryProfile) {
		inMemoryWorkspaceState.set(key, value)
		return
	}
	await context.workspaceState.update(key, value)
}

export async function getWorkspaceState(context: vscode.ExtensionContext, key: LocalStateKey) {
	if (isTemporaryProfile) {
		return inMemoryWorkspaceState.get(key)
	}
	return await context.workspaceState.get(key)
}

export async function getAllExtensionState(context: vscode.ExtensionContext) {
	const [
		isNewUser,
		welcomeViewCompleted,
		openRouterApiKey,
		aeriocodeAccountId,
		openRouterProviderSorting,
		lastShownAnnouncementId,
		taskHistory,
		autoApprovalSettings,
		browserSettings,
		userInfo,
		telemetrySetting,
		planActSeparateModelsSettingRaw,
		favoritedModelIds,
		globalAeriocodeRulesToggles,
		requestTimeoutMs,
		shellIntegrationTimeout,
		enableCheckpointsSettingRaw,
		mcpMarketplaceEnabledRaw,
		mcpDisplayMode,
		mcpResponsesCollapsedRaw,
		globalWorkflowToggles,
		terminalReuseEnabled,
		terminalOutputLineLimit,
		defaultTerminalProfile,
	] = await Promise.all([
		getGlobalState(context, "isNewUser") as Promise<boolean | undefined>,
		getGlobalState(context, "welcomeViewCompleted") as Promise<boolean | undefined>,
		getSecret(context, "openRouterApiKey") as Promise<string | undefined>,
		getSecret(context, "aeriocodeAccountId") as Promise<string | undefined>,
		getGlobalState(context, "openRouterProviderSorting") as Promise<string | undefined>,
		getGlobalState(context, "lastShownAnnouncementId") as Promise<string | undefined>,
		getGlobalState(context, "taskHistory") as Promise<HistoryItem[] | undefined>,
		getGlobalState(context, "autoApprovalSettings") as Promise<AutoApprovalSettings | undefined>,
		getGlobalState(context, "browserSettings") as Promise<BrowserSettings | undefined>,
		getGlobalState(context, "userInfo") as Promise<UserInfo | undefined>,
		getGlobalState(context, "telemetrySetting") as Promise<TelemetrySetting | undefined>,
		getGlobalState(context, "planActSeparateModelsSetting") as Promise<boolean | undefined>,
		getGlobalState(context, "favoritedModelIds") as Promise<string[] | undefined>,
		getGlobalState(context, "globalAeriocodeRulesToggles") as Promise<AeriocodeRulesToggles | undefined>,
		getGlobalState(context, "requestTimeoutMs") as Promise<number | undefined>,
		getGlobalState(context, "shellIntegrationTimeout") as Promise<number | undefined>,
		getGlobalState(context, "enableCheckpointsSetting") as Promise<boolean | undefined>,
		getGlobalState(context, "mcpMarketplaceEnabled") as Promise<boolean | undefined>,
		getGlobalState(context, "mcpDisplayMode") as Promise<McpDisplayMode | undefined>,
		getGlobalState(context, "mcpResponsesCollapsed") as Promise<boolean | undefined>,
		getGlobalState(context, "globalWorkflowToggles") as Promise<AeriocodeRulesToggles | undefined>,
		getGlobalState(context, "terminalReuseEnabled") as Promise<boolean | undefined>,
		getGlobalState(context, "terminalOutputLineLimit") as Promise<number | undefined>,
		getGlobalState(context, "defaultTerminalProfile") as Promise<string | undefined>,
	])

	const [localAeriocodeRulesToggles, localWindsurfRulesToggles, localCursorRulesToggles, localWorkflowToggles] =
		await Promise.all([
			getWorkspaceState(context, "localAeriocodeRulesToggles") as Promise<AeriocodeRulesToggles | undefined>,
			getWorkspaceState(context, "localWindsurfRulesToggles") as Promise<AeriocodeRulesToggles | undefined>,
			getWorkspaceState(context, "localCursorRulesToggles") as Promise<AeriocodeRulesToggles | undefined>,
			getWorkspaceState(context, "workflowToggles") as Promise<AeriocodeRulesToggles | undefined>,
		])

	const [
		preferredLanguage,
		openaiReasoningEffort,
		mode,
		strictPlanModeEnabled,
		// Plan mode configurations
		planModeApiProvider,
		planModeApiModelId,
		planModeThinkingBudgetTokens,
		planModeReasoningEffort,
		planModeOpenRouterModelId,
		planModeOpenRouterModelInfo,
		// Act mode configurations
		actModeApiProvider,
		actModeApiModelId,
		actModeThinkingBudgetTokens,
		actModeReasoningEffort,
		actModeOpenRouterModelId,
		actModeOpenRouterModelInfo,
	] = await Promise.all([
		getGlobalState(context, "preferredLanguage") as Promise<string | undefined>,
		getGlobalState(context, "openaiReasoningEffort") as Promise<OpenaiReasoningEffort | undefined>,
		getGlobalState(context, "mode") as Promise<Mode | undefined>,
		getGlobalState(context, "strictPlanModeEnabled") as Promise<boolean | undefined>,
		// Plan mode configurations
		getGlobalState(context, "planModeApiProvider") as Promise<ApiProvider | undefined>,
		getGlobalState(context, "planModeApiModelId") as Promise<string | undefined>,
		getGlobalState(context, "planModeThinkingBudgetTokens") as Promise<number | undefined>,
		getGlobalState(context, "planModeReasoningEffort") as Promise<string | undefined>,
		getGlobalState(context, "planModeOpenRouterModelId") as Promise<string | undefined>,
		getGlobalState(context, "planModeOpenRouterModelInfo") as Promise<ModelInfo | undefined>,
		// Act mode configurations
		getGlobalState(context, "actModeApiProvider") as Promise<ApiProvider | undefined>,
		getGlobalState(context, "actModeApiModelId") as Promise<string | undefined>,
		getGlobalState(context, "actModeThinkingBudgetTokens") as Promise<number | undefined>,
		getGlobalState(context, "actModeReasoningEffort") as Promise<string | undefined>,
		getGlobalState(context, "actModeOpenRouterModelId") as Promise<string | undefined>,
		getGlobalState(context, "actModeOpenRouterModelInfo") as Promise<ModelInfo | undefined>,
	])

	let apiProvider: ApiProvider
	if (planModeApiProvider) {
		apiProvider = planModeApiProvider
	} else {
		// Default to aeriocode for new users
		apiProvider = "aeriocode"
	}

	const mcpMarketplaceEnabled = await migrateMcpMarketplaceEnableSetting(mcpMarketplaceEnabledRaw)
	const enableCheckpointsSetting = await migrateEnableCheckpointsSetting(enableCheckpointsSettingRaw)
	const mcpResponsesCollapsed = mcpResponsesCollapsedRaw ?? false

	// Plan/Act separate models setting is a boolean indicating whether the user wants to use different models for plan and act. Existing users expect this to be enabled, while we want new users to opt in to this being disabled by default.
	// On win11 state sometimes initializes as empty string instead of undefined
	let planActSeparateModelsSetting: boolean | undefined = undefined
	if (planActSeparateModelsSettingRaw === true || planActSeparateModelsSettingRaw === false) {
		planActSeparateModelsSetting = planActSeparateModelsSettingRaw
	} else {
		// default to true for existing users
		if (planModeApiProvider) {
			planActSeparateModelsSetting = true
		} else {
			// default to false for new users
			planActSeparateModelsSetting = false
		}
		// this is a special case where it's a new state, but we want it to default to different values for existing and new users.
		// persist so next time state is retrieved it's set to the correct value.
		await updateGlobalState(context, "planActSeparateModelsSetting", planActSeparateModelsSetting)
	}

	return {
		apiConfiguration: {
			openRouterApiKey,
			aeriocodeAccountId,
			openRouterProviderSorting,
			openRouterModelId: planModeOpenRouterModelId, // Use plan mode as default
			openRouterModelInfo: planModeOpenRouterModelInfo, // Use plan mode as default
			favoritedModelIds,
			requestTimeoutMs,
			// Plan mode configurations
			planModeApiProvider: planModeApiProvider || apiProvider,
			planModeApiModelId,
			planModeThinkingBudgetTokens,
			planModeReasoningEffort,
			planModeOpenRouterModelId,
			planModeOpenRouterModelInfo,
			// Act mode configurations
			actModeApiProvider: actModeApiProvider || apiProvider,
			actModeApiModelId,
			actModeThinkingBudgetTokens,
			actModeReasoningEffort,
			actModeOpenRouterModelId,
			actModeOpenRouterModelInfo,
		},
		isNewUser: isNewUser ?? true,
		welcomeViewCompleted,
		lastShownAnnouncementId,
		taskHistory,
		autoApprovalSettings: autoApprovalSettings || DEFAULT_AUTO_APPROVAL_SETTINGS, // default value can be 0 or empty string
		globalAeriocodeRulesToggles: globalAeriocodeRulesToggles || {},
		browserSettings: { ...DEFAULT_BROWSER_SETTINGS, ...browserSettings }, // this will ensure that older versions of browserSettings (e.g. before remoteBrowserEnabled was added) are merged with the default values (false for remoteBrowserEnabled)
		preferredLanguage: preferredLanguage || "English",
		openaiReasoningEffort: (openaiReasoningEffort as OpenaiReasoningEffort) || "medium",
		mode: mode || "act",
		strictPlanModeEnabled: strictPlanModeEnabled ?? false,
		userInfo,
		mcpMarketplaceEnabled: mcpMarketplaceEnabled,
		mcpDisplayMode: mcpDisplayMode ?? DEFAULT_MCP_DISPLAY_MODE,
		mcpResponsesCollapsed: mcpResponsesCollapsed,
		telemetrySetting: telemetrySetting || "unset",
		planActSeparateModelsSetting,
		enableCheckpointsSetting: enableCheckpointsSetting,
		shellIntegrationTimeout: shellIntegrationTimeout || 4000,
		terminalReuseEnabled: terminalReuseEnabled ?? true,
		terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
		defaultTerminalProfile: defaultTerminalProfile ?? "default",
		globalWorkflowToggles: globalWorkflowToggles || {},
		localAeriocodeRulesToggles: localAeriocodeRulesToggles || {},
		localWindsurfRulesToggles: localWindsurfRulesToggles || {},
		localCursorRulesToggles: localCursorRulesToggles || {},
		localWorkflowToggles: localWorkflowToggles || {},
	}
}

export async function resetWorkspaceState(controller: Controller) {
	const context = controller.context
	await Promise.all(context.workspaceState.keys().map((key) => controller.context.workspaceState.update(key, undefined)))

	await controller.cacheService.reInitialize()
}

export async function resetGlobalState(controller: Controller) {
	// TODO: Reset all workspace states?
	const context = controller.context

	await Promise.all(context.globalState.keys().map((key) => context.globalState.update(key, undefined)))
	const secretKeys: SecretKey[] = ["openRouterApiKey", "aeriocodeAccountId"]
	await Promise.all(secretKeys.map((key) => storeSecret(context, key, undefined)))
	await controller.cacheService.reInitialize()
}
