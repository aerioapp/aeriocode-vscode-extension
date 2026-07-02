import * as vscode from "vscode"
import { ensureRulesDirectoryExists } from "./disk"
import fs from "fs/promises"
import path from "path"
import { updateGlobalState, getAllExtensionState, getGlobalState } from "./state"

export async function migrateWorkspaceToGlobalStorage(context: vscode.ExtensionContext) {
	// Keys to migrate from workspace storage back to global storage
	const keysToMigrate = [
		// Core settings
		"apiProvider",
		"apiModelId",
		"thinkingBudgetTokens",
		"reasoningEffort",
		"vsCodeLmModelSelector",

		// Provider-specific model keys - Aeriocode only
		"openRouterModelId",
		"openRouterModelInfo",

		// Previous mode settings
		"previousModeApiProvider",
		"previousModeModelId",
		"previousModeModelInfo",
		"previousModeVsCodeLmModelSelector",
		"previousModeThinkingBudgetTokens",
		"previousModeReasoningEffort",
	]

	for (const key of keysToMigrate) {
		// Use raw workspace state since these keys shouldn't be in workspace storage
		const workspaceValue = await context.workspaceState.get(key)
		const globalValue = await context.globalState.get(key)

		if (workspaceValue !== undefined && globalValue === undefined) {
			console.log(`[Storage Migration] migrating key: ${key} to global storage. Current value: ${workspaceValue}`)

			// Move to global storage using raw VSCode method to avoid type errors
			await context.globalState.update(key, workspaceValue)
			// Remove from workspace storage
			await context.workspaceState.update(key, undefined)
			const newWorkspaceValue = await context.workspaceState.get(key)

			console.log(`[Storage Migration] migrated key: ${key} to global storage. Current value: ${newWorkspaceValue}`)
		}
	}
}

export async function migrateMcpMarketplaceEnableSetting(mcpMarketplaceEnabledRaw: boolean | undefined): Promise<boolean> {
	const config = vscode.workspace.getConfiguration("aeriocode")
	const mcpMarketplaceEnabled = config.get<boolean>("mcpMarketplace.enabled")
	if (mcpMarketplaceEnabled !== undefined) {
		// Remove from VSCode configuration
		await config.update("mcpMarketplace.enabled", undefined, true)

		return !mcpMarketplaceEnabled
	}
	return mcpMarketplaceEnabledRaw ?? true
}

export async function migrateEnableCheckpointsSetting(enableCheckpointsSettingRaw: boolean | undefined): Promise<boolean> {
	const config = vscode.workspace.getConfiguration("aeriocode")
	const enableCheckpoints = config.get<boolean>("enableCheckpoints")
	if (enableCheckpoints !== undefined) {
		// Remove from VSCode configuration
		await config.update("enableCheckpoints", undefined, true)
		return enableCheckpoints
	}
	return enableCheckpointsSettingRaw ?? true
}

export async function migrateCustomInstructionsToGlobalRules(context: vscode.ExtensionContext) {
	try {
		const customInstructions = (await context.globalState.get("customInstructions")) as string | undefined

		if (customInstructions?.trim()) {
			console.log("Migrating custom instructions to global Aeriocode rules...")

			// Create global .aeriocoderules directory if it doesn't exist
			const globalRulesDir = await ensureRulesDirectoryExists()

			// Use a fixed filename for custom instructions
			const migrationFileName = "custom_instructions.md"
			const migrationFilePath = path.join(globalRulesDir, migrationFileName)

			try {
				// Check if file already exists to determine if we should append
				let existingContent = ""
				try {
					existingContent = await fs.readFile(migrationFilePath, "utf8")
				} catch (readError) {
					// File doesn't exist, which is fine
				}

				// Append or create the file with custom instructions
				const contentToWrite = existingContent
					? `${existingContent}\n\n---\n\n${customInstructions.trim()}`
					: customInstructions.trim()

				await fs.writeFile(migrationFilePath, contentToWrite)
				console.log(`Successfully ${existingContent ? "appended to" : "created"} migration file: ${migrationFilePath}`)
			} catch (fileError) {
				console.error("Failed to write migration file:", fileError)
				return
			}

			// Remove customInstructions from global state only after successful file creation
			await context.globalState.update("customInstructions", undefined)
			console.log("Successfully migrated custom instructions to global Aeriocode rules")
		}
	} catch (error) {
		console.error("Failed to migrate custom instructions to global rules:", error)
		// Continue execution - migration failure shouldn't break extension startup
	}
}

export async function migrateLegacyApiConfigurationToModeSpecific(context: vscode.ExtensionContext) {
	try {
		// Check if migration is needed - if planModeApiProvider already exists, skip migration
		const planModeApiProvider = await context.globalState.get("planModeApiProvider")
		if (planModeApiProvider !== undefined) {
			console.log("Legacy API configuration migration already completed, skipping...")
			return
		}

		console.log("Starting legacy API configuration migration to mode-specific keys...")

		// Get the planActSeparateModelsSetting to determine migration strategy
		const planActSeparateModelsSetting = (await context.globalState.get("planActSeparateModelsSetting")) as
			| boolean
			| undefined

		// Read legacy values directly - Aeriocode only
		const apiProvider = await context.globalState.get("apiProvider")
		const apiModelId = await context.globalState.get("apiModelId")
		const thinkingBudgetTokens = await context.globalState.get("thinkingBudgetTokens")
		const reasoningEffort = await context.globalState.get("reasoningEffort")
		const vsCodeLmModelSelector = await context.globalState.get("vsCodeLmModelSelector")
		const openRouterModelId = await context.globalState.get("openRouterModelId")
		const openRouterModelInfo = await context.globalState.get("openRouterModelInfo")

		// Read previous mode values
		const previousModeApiProvider = await context.globalState.get("previousModeApiProvider")
		const previousModeModelId = await context.globalState.get("previousModeModelId")
		const previousModeModelInfo = await context.globalState.get("previousModeModelInfo")
		const previousModeVsCodeLmModelSelector = await context.globalState.get("previousModeVsCodeLmModelSelector")
		const previousModeThinkingBudgetTokens = await context.globalState.get("previousModeThinkingBudgetTokens")
		const previousModeReasoningEffort = await context.globalState.get("previousModeReasoningEffort")

		// Migrate based on planActSeparateModelsSetting
		if (planActSeparateModelsSetting === false) {
			console.log("Migrating with separate models DISABLED - using current values for both modes")

			// Use current values for both plan and act modes
			if (apiProvider !== undefined) {
				await context.globalState.update("planModeApiProvider", apiProvider)
				await context.globalState.update("actModeApiProvider", apiProvider)
			}
			if (apiModelId !== undefined) {
				await context.globalState.update("planModeApiModelId", apiModelId)
				await context.globalState.update("actModeApiModelId", apiModelId)
			}
			if (thinkingBudgetTokens !== undefined) {
				await context.globalState.update("planModeThinkingBudgetTokens", thinkingBudgetTokens)
				await context.globalState.update("actModeThinkingBudgetTokens", thinkingBudgetTokens)
			}
			if (reasoningEffort !== undefined) {
				await context.globalState.update("planModeReasoningEffort", reasoningEffort)
				await context.globalState.update("actModeReasoningEffort", reasoningEffort)
			}
			if (vsCodeLmModelSelector !== undefined) {
				await context.globalState.update("planModeVsCodeLmModelSelector", vsCodeLmModelSelector)
				await context.globalState.update("actModeVsCodeLmModelSelector", vsCodeLmModelSelector)
			}
			if (openRouterModelId !== undefined) {
				await context.globalState.update("planModeOpenRouterModelId", openRouterModelId)
				await context.globalState.update("actModeOpenRouterModelId", openRouterModelId)
			}
			if (openRouterModelInfo !== undefined) {
				await context.globalState.update("planModeOpenRouterModelInfo", openRouterModelInfo)
				await context.globalState.update("actModeOpenRouterModelInfo", openRouterModelInfo)
			}
		} else {
			console.log("Migrating with separate models ENABLED - using current->plan, previous->act")

			// Use current values for plan mode
			if (apiProvider !== undefined) {
				await context.globalState.update("planModeApiProvider", apiProvider)
			}
			if (apiModelId !== undefined) {
				await context.globalState.update("planModeApiModelId", apiModelId)
			}
			if (thinkingBudgetTokens !== undefined) {
				await context.globalState.update("planModeThinkingBudgetTokens", thinkingBudgetTokens)
			}
			if (reasoningEffort !== undefined) {
				await context.globalState.update("planModeReasoningEffort", reasoningEffort)
			}
			if (vsCodeLmModelSelector !== undefined) {
				await context.globalState.update("planModeVsCodeLmModelSelector", vsCodeLmModelSelector)
			}
			if (openRouterModelId !== undefined) {
				await context.globalState.update("planModeOpenRouterModelId", openRouterModelId)
			}
			if (openRouterModelInfo !== undefined) {
				await context.globalState.update("planModeOpenRouterModelInfo", openRouterModelInfo)
			}

			// Use previous values for act mode (with fallback to current values)
			if (previousModeApiProvider !== undefined) {
				await context.globalState.update("actModeApiProvider", previousModeApiProvider)
			} else if (apiProvider !== undefined) {
				await context.globalState.update("actModeApiProvider", apiProvider)
			}
			if (previousModeModelId !== undefined) {
				await context.globalState.update("actModeApiModelId", previousModeModelId)
			} else if (apiModelId !== undefined) {
				await context.globalState.update("actModeApiModelId", apiModelId)
			}
			if (previousModeThinkingBudgetTokens !== undefined) {
				await context.globalState.update("actModeThinkingBudgetTokens", previousModeThinkingBudgetTokens)
			} else if (thinkingBudgetTokens !== undefined) {
				await context.globalState.update("actModeThinkingBudgetTokens", thinkingBudgetTokens)
			}
			if (previousModeReasoningEffort !== undefined) {
				await context.globalState.update("actModeReasoningEffort", previousModeReasoningEffort)
			} else if (reasoningEffort !== undefined) {
				await context.globalState.update("actModeReasoningEffort", reasoningEffort)
			}
			if (previousModeVsCodeLmModelSelector !== undefined) {
				await context.globalState.update("actModeVsCodeLmModelSelector", previousModeVsCodeLmModelSelector)
			} else if (vsCodeLmModelSelector !== undefined) {
				await context.globalState.update("actModeVsCodeLmModelSelector", vsCodeLmModelSelector)
			}
			if (previousModeModelInfo !== undefined) {
				await context.globalState.update("actModeOpenRouterModelInfo", previousModeModelInfo)
			} else if (openRouterModelInfo !== undefined) {
				await context.globalState.update("actModeOpenRouterModelInfo", openRouterModelInfo)
			}
			if (openRouterModelId !== undefined) {
				await context.globalState.update("actModeOpenRouterModelId", openRouterModelId)
			}
		}

		// Clean up legacy keys after successful migration
		console.log("Cleaning up legacy keys...")
		await context.globalState.update("apiProvider", undefined)
		await context.globalState.update("apiModelId", undefined)
		await context.globalState.update("thinkingBudgetTokens", undefined)
		await context.globalState.update("reasoningEffort", undefined)
		await context.globalState.update("vsCodeLmModelSelector", undefined)
		await context.globalState.update("openRouterModelId", undefined)
		await context.globalState.update("openRouterModelInfo", undefined)
		await context.globalState.update("previousModeApiProvider", undefined)
		await context.globalState.update("previousModeModelId", undefined)
		await context.globalState.update("previousModeModelInfo", undefined)
		await context.globalState.update("previousModeVsCodeLmModelSelector", undefined)
		await context.globalState.update("previousModeThinkingBudgetTokens", undefined)
		await context.globalState.update("previousModeReasoningEffort", undefined)

		console.log("Successfully migrated legacy API configuration to mode-specific keys")
	} catch (error) {
		console.error("Failed to migrate legacy API configuration to mode-specific keys:", error)
		// Continue execution - migration failure shouldn't break extension startup
	}
}

export async function migrateWelcomeViewCompleted(context: vscode.ExtensionContext) {
	try {
		// Check if welcomeViewCompleted is already set
		const welcomeViewCompleted = await getGlobalState(context, "welcomeViewCompleted")

		if (welcomeViewCompleted === undefined) {
			console.log("Migrating welcomeViewCompleted setting...")

			// Get all extension state to check for existing API keys
			const extensionState = await getAllExtensionState(context)
			const config = extensionState.apiConfiguration

			// This is the original logic used for checking is the welcome view should be shown
			// It was located in the ExtensionStateContextProvider
			// Simplified for Aeriocode only
			const hasKey = config ? [config.openRouterApiKey, config.aeriocodeAccountId].some((key) => key !== undefined) : false

			// Set welcomeViewCompleted based on whether user has keys
			await updateGlobalState(context, "welcomeViewCompleted", hasKey)

			console.log(`Migration: Set welcomeViewCompleted to ${hasKey} based on existing API keys`)
		}
	} catch (error) {
		console.error("Failed to migrate welcomeViewCompleted:", error)
		// Continue execution - migration failure shouldn't break extension startup
	}
}
