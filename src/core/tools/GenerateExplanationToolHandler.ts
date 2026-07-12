import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import fs from "fs/promises"
import path from "path"
import simpleGit from "simple-git"
import type { AeriocodeSayGenerateExplanation } from "@/shared/ExtensionMessage"
import { Logger } from "@/services/logging/Logger"
import type { ToolResponse } from "../task/index"
import type { IPartialBlockHandler, IToolHandler } from "./ToolExecutorCoordinator"
import type { TaskConfig } from "./types/TaskConfig"
import type { StronglyTypedUIHelpers } from "./types/UIHelpers"

function createExplanationMessage(
	title: string,
	fromRef: string,
	toRef: string,
	status: AeriocodeSayGenerateExplanation["status"],
	error?: string,
): string {
	const message: AeriocodeSayGenerateExplanation = { title, fromRef, toRef, status }
	if (error) {
		message.error = error
	}
	return JSON.stringify(message)
}

export class GenerateExplanationToolHandler implements IToolHandler, IPartialBlockHandler {
	readonly name = "generate_explanation"

	getDescription(block: ToolUse): string {
		const title = block.params.title || "code changes"
		return `[${block.name} for '${title}']`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const title = block.params.title || "code changes"
		const fromRef = block.params.from_ref || ""
		const toRef = block.params.to_ref || "working directory"
		const messageText = createExplanationMessage(title, fromRef, toRef, "generating")
		await uiHelpers.say("generate_explanation", messageText, undefined, undefined, true)
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const title: string | undefined = block.params.title
		const fromRef: string | undefined = block.params.from_ref
		const toRef: string | undefined = block.params.to_ref

		if (!title) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "title")
		}

		if (!fromRef) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "from_ref")
		}

		config.taskState.consecutiveMistakeCount = 0

		const toRefDisplay = toRef || "working directory"
		await config.callbacks.say(
			"generate_explanation",
			createExplanationMessage(title, fromRef, toRefDisplay, "generating"),
			undefined,
			undefined,
			true,
		)

		const apiConfiguration = config.services.stateManager.getApiConfiguration()
		if (!apiConfiguration) {
			await config.callbacks.say(
				"generate_explanation",
				createExplanationMessage(title, fromRef, toRefDisplay, "error", "API configuration not available"),
				undefined,
				undefined,
				false,
			)
			return formatResponse.toolError("API configuration not available")
		}

		try {
			const cwd = config.cwd
			const git = simpleGit(cwd)

			const isRepo = await git.checkIsRepo()
			if (!isRepo) {
				const errorMsg = `The current directory (${cwd}) is not a git repository. This tool requires git to compare changes.`
				await config.callbacks.say(
					"generate_explanation",
					createExplanationMessage(title, fromRef, toRefDisplay, "error", errorMsg),
					undefined,
					undefined,
					false,
				)
				return formatResponse.toolError(errorMsg)
			}

			try {
				await git.revparse([fromRef])
			} catch {
				const errorMsg = `Invalid git reference '${fromRef}'. Please provide a valid commit hash, branch name, tag, or relative reference (e.g., HEAD~1).`
				await config.callbacks.say(
					"generate_explanation",
					createExplanationMessage(title, fromRef, toRefDisplay, "error", errorMsg),
					undefined,
					undefined,
					false,
				)
				return formatResponse.toolError(errorMsg)
			}

			if (toRef) {
				try {
					await git.revparse([toRef])
				} catch {
					const errorMsg = `Invalid git reference '${toRef}'. Please provide a valid commit hash, branch name, tag, or relative reference.`
					await config.callbacks.say(
						"generate_explanation",
						createExplanationMessage(title, fromRef, toRefDisplay, "error", errorMsg),
						undefined,
						undefined,
						false,
					)
					return formatResponse.toolError(errorMsg)
				}
			}

			const diffRange = toRef ? `${fromRef}..${toRef}` : fromRef
			const diffSummary = await git.diffSummary([diffRange])

			if (diffSummary.files.length === 0) {
				return formatResponse.toolResult(`No changes found between '${fromRef}' and '${toRef || "working directory"}'.`)
			}

			const changedFiles: Array<{ relativePath: string; absolutePath: string; before: string; after: string }> = []

			for (const file of diffSummary.files) {
				const filePath = file.file
				const absolutePath = path.join(cwd, filePath)

				let beforeContent = ""
				try {
					beforeContent = await git.show([`${fromRef}:${filePath}`])
				} catch {
					// File didn't exist in the 'from' ref (new file)
				}

				let afterContent = ""
				if (toRef) {
					try {
						afterContent = await git.show([`${toRef}:${filePath}`])
					} catch {
						// File doesn't exist in the 'to' ref (deleted file)
					}
				} else {
					try {
						afterContent = await fs.readFile(absolutePath, "utf8")
					} catch {
						// File was deleted in working directory
					}
				}

				changedFiles.push({
					relativePath: filePath,
					absolutePath,
					before: beforeContent,
					after: afterContent,
				})
			}

			if (changedFiles.length === 0) {
				return formatResponse.toolResult(
					`All changed files between '${fromRef}' and '${toRef || "working directory"}' are binary files that cannot be displayed.`,
				)
			}

			const fileSummary = changedFiles.map((f) => `  - ${f.relativePath}`).join("\n")
			const refDescription = toRef ? `'${fromRef}' and '${toRef}'` : `'${fromRef}' and working directory`

			await config.callbacks.say(
				"generate_explanation",
				createExplanationMessage(title, fromRef, toRefDisplay, "complete"),
				undefined,
				undefined,
				false,
			)

			return formatResponse.toolResult(
				`Generated explanation for ${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"} between ${refDescription}.\n\nChanged files:\n${fileSummary}\n\nNote: Full inline comment generation requires AerioCode VS Code integration.`,
			)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error"
			Logger.error("Error in generate_explanation:", error instanceof Error ? error : new Error(errorMessage))
			await config.callbacks.say(
				"generate_explanation",
				createExplanationMessage(
					title,
					fromRef,
					toRefDisplay,
					"error",
					`Failed to generate explanations: ${errorMessage}`,
				),
				undefined,
				undefined,
				false,
			)
			return formatResponse.toolError(`Failed to generate explanations: ${errorMessage}`)
		}
	}
}
