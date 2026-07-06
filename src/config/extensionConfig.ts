/**
 * Extension configuration constants
 * Centralizes all extension-related identifiers to avoid hardcoding
 */

import * as vscode from "vscode"

/**
 * Get the current extension ID dynamically from the extension context
 */
export function getExtensionId(): string {
	const extension = vscode.extensions.getExtension("aerio.Aerio-Code")
	return extension?.id || "aerio.Aerio-Code"
}

/**
 * Get the extension publisher
 */
export function getExtensionPublisher(): string {
	return "aeriocode"
}

/**
 * Get the extension name
 */
export function getExtensionName(): string {
	return "aeriocode"
}

/**
 * Command IDs used throughout the extension
 */
export const COMMANDS = {
	// Sidebar commands
	SIDEBAR_PROVIDER_FOCUS: "aeriocode.SidebarProvider.focus",
	SIDEBAR_PROVIDER_TOGGLE: "aeriocode.SidebarProvider.toggle",

	// Tab panel commands
	TAB_PANEL_PROVIDER_FOCUS: "aeriocode.TabPanelProvider.focus",

	// Activity bar commands
	ACTIVITY_BAR_FOCUS: "aeriocode-ActivityBar.focus",

	// General commands
	OPEN_IN_NEW_TAB: "aeriocode.openInNewTab",
	ADD_TO_CHAT: "aeriocode.addToChat",
	ADD_TERMINAL_OUTPUT_TO_CHAT: "aeriocode.addTerminalOutputToChat",
	FOCUS_CHAT_INPUT: "aeriocode.focusChatInput",
	GENERATE_GIT_COMMIT_MESSAGE: "aeriocode.generateGitCommitMessage",
	ABORT_GIT_COMMIT_MESSAGE: "aeriocode.abortGitCommitMessage",
	EXPLAIN_CODE: "aeriocode.explainCode",
	IMPROVE_CODE: "aeriocode.improveCode",
	OPEN_WALKTHROUGH: "aeriocode.openWalkthrough",

	// Button commands
	PLUS_BUTTON_CLICKED: "aeriocode.plusButtonClicked",
	MCP_BUTTON_CLICKED: "aeriocode.mcpButtonClicked",
	HISTORY_BUTTON_CLICKED: "aeriocode.historyButtonClicked",
	POPOUT_BUTTON_CLICKED: "aeriocode.popoutButtonClicked",
	ACCOUNT_BUTTON_CLICKED: "aeriocode.accountButtonClicked",
	SETTINGS_BUTTON_CLICKED: "aeriocode.settingsButtonClicked",

	// Dev commands
	DEV_CREATE_TEST_TASKS: "aeriocode.dev.createTestTasks",
} as const

/**
 * View IDs used throughout the extension
 */
export const VIEWS = {
	SIDEBAR_PROVIDER: "aeriocode.SidebarProvider",
	TAB_PANEL_PROVIDER: "aeriocode.TabPanelProvider",
	ACTIVITY_BAR: "aeriocode-ActivityBar",
} as const

/**
 * Context keys used throughout the extension
 */
export const CONTEXT_KEYS = {
	IS_DEV_MODE: "aeriocode.isDevMode",
	IS_GENERATING_COMMIT: "aeriocode.isGeneratingCommit",
} as const

/**
 * Walkthrough IDs
 */
export const WALKTHROUGHS = {
	MAIN: "aerio.Aerio-Code#AeriocodeWalkthrough",
} as const

/**
 * Get a command ID with the current extension prefix
 */
export function getCommandId(command: string): string {
	return `aeriocode.${command}`
}

/**
 * Get a view ID with the current extension prefix
 */
export function getViewId(view: string): string {
	return `aeriocode.${view}`
}

/**
 * Get a context key with the current extension prefix
 */
export function getContextKey(key: string): string {
	return `aeriocode.${key}`
}
