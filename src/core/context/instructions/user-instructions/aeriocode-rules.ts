import path from "path"
import { ensureRulesDirectoryExists, GlobalFileNames } from "@core/storage/disk"
import { fileExistsAtPath, isDirectory, readDirectory } from "@utils/fs"
import { formatResponse } from "@core/prompts/responses"
import fs from "fs/promises"
import { AeriocodeRulesToggles } from "@shared/aeriocode-rules"
import { getGlobalState, getWorkspaceState, updateGlobalState, updateWorkspaceState } from "@core/storage/state"
import * as vscode from "vscode"
import { synchronizeRuleToggles, getRuleFilesTotalContent } from "@core/context/instructions/user-instructions/rule-helpers"

export const getGlobalAeriocodeRules = async (globalAeriocodeRulesFilePath: string, toggles: AeriocodeRulesToggles) => {
	if (await fileExistsAtPath(globalAeriocodeRulesFilePath)) {
		if (await isDirectory(globalAeriocodeRulesFilePath)) {
			try {
				const rulesFilePaths = await readDirectory(globalAeriocodeRulesFilePath)
				const rulesFilesTotalContent = await getRuleFilesTotalContent(
					rulesFilePaths,
					globalAeriocodeRulesFilePath,
					toggles,
				)
				if (rulesFilesTotalContent) {
					const aeriocodeRulesFileInstructions = formatResponse.aeriocodeRulesGlobalDirectoryInstructions(
						globalAeriocodeRulesFilePath,
						rulesFilesTotalContent,
					)
					return aeriocodeRulesFileInstructions
				}
			} catch {
				console.error(`Failed to read .aeriocoderules directory at ${globalAeriocodeRulesFilePath}`)
			}
		} else {
			console.error(`${globalAeriocodeRulesFilePath} is not a directory`)
			return undefined
		}
	}

	return undefined
}

export const getLocalAeriocodeRules = async (cwd: string, toggles: AeriocodeRulesToggles) => {
	const aeriocodeRulesFilePath = path.resolve(cwd, GlobalFileNames.aeriocodeRules)

	let aeriocodeRulesFileInstructions: string | undefined

	if (await fileExistsAtPath(aeriocodeRulesFilePath)) {
		if (await isDirectory(aeriocodeRulesFilePath)) {
			try {
				const rulesFilePaths = await readDirectory(aeriocodeRulesFilePath, [[".aeriocoderules", "workflows"]])

				const rulesFilesTotalContent = await getRuleFilesTotalContent(rulesFilePaths, cwd, toggles)
				if (rulesFilesTotalContent) {
					aeriocodeRulesFileInstructions = formatResponse.aeriocodeRulesLocalDirectoryInstructions(
						cwd,
						rulesFilesTotalContent,
					)
				}
			} catch {
				console.error(`Failed to read .aeriocoderules directory at ${aeriocodeRulesFilePath}`)
			}
		} else {
			try {
				if (aeriocodeRulesFilePath in toggles && toggles[aeriocodeRulesFilePath] !== false) {
					const ruleFileContent = (await fs.readFile(aeriocodeRulesFilePath, "utf8")).trim()
					if (ruleFileContent) {
						aeriocodeRulesFileInstructions = formatResponse.aeriocodeRulesLocalFileInstructions(cwd, ruleFileContent)
					}
				}
			} catch {
				console.error(`Failed to read .aeriocoderules file at ${aeriocodeRulesFilePath}`)
			}
		}
	}

	return aeriocodeRulesFileInstructions
}

export async function refreshAeriocodeRulesToggles(
	context: vscode.ExtensionContext,
	workingDirectory: string,
): Promise<{
	globalToggles: AeriocodeRulesToggles
	localToggles: AeriocodeRulesToggles
}> {
	// Global toggles
	const globalAeriocodeRulesToggles =
		((await getGlobalState(context, "globalAeriocodeRulesToggles")) as AeriocodeRulesToggles) || {}
	const globalAeriocodeRulesFilePath = await ensureRulesDirectoryExists()
	const updatedGlobalToggles = await synchronizeRuleToggles(globalAeriocodeRulesFilePath, globalAeriocodeRulesToggles)
	await updateGlobalState(context, "globalAeriocodeRulesToggles", updatedGlobalToggles)

	// Local toggles
	const localAeriocodeRulesToggles =
		((await getWorkspaceState(context, "localAeriocodeRulesToggles")) as AeriocodeRulesToggles) || {}
	const localAeriocodeRulesFilePath = path.resolve(workingDirectory, GlobalFileNames.aeriocodeRules)
	const updatedLocalToggles = await synchronizeRuleToggles(localAeriocodeRulesFilePath, localAeriocodeRulesToggles, "", [
		[".aeriocoderules", "workflows"],
	])
	await updateWorkspaceState(context, "localAeriocodeRulesToggles", updatedLocalToggles)

	return {
		globalToggles: updatedGlobalToggles,
		localToggles: updatedLocalToggles,
	}
}
