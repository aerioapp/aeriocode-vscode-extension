import { readFile } from "node:fs/promises"
import { resolve as resolvePath } from "node:path"
import type { ToolUse } from "@core/assistant-message"
import { resolveWorkspacePath } from "./utils/workspacePath"
import { processFilesIntoText } from "@integrations/misc/extract-text"
import type { AeriocodeSayTool } from "@shared/ExtensionMessage"
import { fileExistsAtPath } from "@utils/fs"
import { getReadablePath, isLocatedInWorkspace } from "@utils/path"
import { applyPatch } from "diff"
import { telemetryService } from "@/services/telemetry"
import { BASH_WRAPPERS, DiffError, PATCH_MARKERS, type Patch, PatchActionType, type PatchChunk } from "./utils/PatchParser"
import { preserveEscaping } from "@/shared/string"
import type { ToolResponse } from "../task/index"
import { showNotificationForApprovalIfAutoApprovalEnabled } from "../task/utils"
import type { IFullyManagedTool } from "./ToolExecutorCoordinator"
import type { ToolValidator } from "./utils/ToolValidator"
import type { TaskConfig } from "./types/TaskConfig"
import type { StronglyTypedUIHelpers } from "./types/UIHelpers"
import { captureAccepted, captureRejected, getModelInfo } from "./utils/AiOutputTelemetry"
import { type FileOpsResult, FileProviderOperations } from "./utils/FileProviderOperations"
import { PatchParser } from "./utils/PatchParser"
import { PathResolver } from "./utils/PathResolver"
import { ToolResultUtils } from "./utils/ToolResultUtils"

interface FileChange {
	type: PatchActionType
	oldContent?: string
	newContent?: string
	movePath?: string
	startLineNumbers?: number[]
}

interface Commit {
	changes: Record<string, FileChange>
}

export const PatchAeriocodeSayMap = {
	[PatchActionType.ADD]: "newFileCreated",
	[PatchActionType.DELETE]: "fileDeleted",
	[PatchActionType.UPDATE]: "editedExistingFile",
}

export class ApplyPatchHandler implements IFullyManagedTool {
	readonly name = "apply_patch"
	private config?: TaskConfig
	private pathResolver?: PathResolver
	private providerOps?: FileProviderOperations

	constructor(private validator: ToolValidator) {}

	private initializeHelpers(config: TaskConfig): void {
		if (!this.pathResolver || this.config !== config) {
			this.pathResolver = new PathResolver(config, this.validator)
		}
		if (!this.providerOps) {
			this.providerOps = new FileProviderOperations(config.services.diffViewProvider)
		}
	}

	getDescription(_block: ToolUse): string {
		return `[${this.name} for patch application]`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const rawInput = block.params.input
		if (!rawInput) {
			return
		}

		try {
			const allFiles = this.extractAllFiles(rawInput)
			if (allFiles.length === 0) {
				return
			}

			const config = uiHelpers.getConfig()
			this.initializeHelpers(config)

			await this.previewPatchStream(rawInput, uiHelpers).catch(() => {})
		} catch {
			// Wait for more data if parsing fails
		}
	}

	private async previewPatchStream(rawInput: string, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const config = uiHelpers.getConfig()
		const provider = config.services.diffViewProvider
		this.initializeHelpers(config)

		const lines = this.stripBashWrapper(rawInput.split("\n"))

		let targetPath: string | undefined
		let actionType: PatchActionType | undefined
		let contentStartIndex = -1

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			if (line.startsWith(PATCH_MARKERS.ADD)) {
				provider.editType = "modify"
				targetPath = line.substring(PATCH_MARKERS.ADD.length).trim()
				actionType = PatchActionType.ADD
				contentStartIndex = i + 1
				break
			}
			if (line.startsWith(PATCH_MARKERS.UPDATE)) {
				provider.editType = "modify"
				targetPath = line.substring(PATCH_MARKERS.UPDATE.length).trim()
				actionType = PatchActionType.UPDATE
				contentStartIndex = i + 1
				break
			}
			if (line.startsWith(PATCH_MARKERS.DELETE)) {
				targetPath = line.substring(PATCH_MARKERS.DELETE.length).trim()
				actionType = PatchActionType.DELETE
				contentStartIndex = i + 1
				break
			}
		}

		if (!targetPath || targetPath.length === 0 || targetPath.includes("***") || !actionType) {
			return
		}

		let movePath: string | undefined
		if (actionType === PatchActionType.UPDATE && contentStartIndex >= 0) {
			const nextLine = lines[contentStartIndex]
			if (nextLine?.startsWith(PATCH_MARKERS.MOVE)) {
				movePath = nextLine.substring(PATCH_MARKERS.MOVE.length).trim()
				contentStartIndex++
			}
		}

		if (actionType === PatchActionType.ADD) {
			if (contentStartIndex < 0 || contentStartIndex >= lines.length) {
				return
			}
			const contentLines = lines.slice(contentStartIndex)
			if (contentLines.length === 0 || (contentLines.length === 1 && contentLines[0] === "")) {
				return
			}
		}

		const finalPath = movePath || targetPath
		const targetResolution = await this.pathResolver!.resolveAndValidate(finalPath, "ApplyPatchHandler.previewPatch")
		if (!targetResolution) {
			return
		}

		await config.callbacks
			.ask(
				"tool",
				JSON.stringify({
					tool: PatchAeriocodeSayMap[actionType],
					path: getReadablePath(config.cwd, finalPath),
					content: rawInput,
					operationIsLocatedInWorkspace: await isLocatedInWorkspace(finalPath),
				}),
				true,
			)
			.catch(() => {})

		const stream: { content: string | undefined } = { content: undefined }

		switch (actionType) {
			case PatchActionType.ADD: {
				const contentLines = lines.slice(contentStartIndex)
				stream.content = contentLines
					.filter((l) => l.startsWith("+"))
					.map((l) => l.substring(1))
					.join("\n")
				break
			}
			case PatchActionType.UPDATE: {
				const sourceResolution = await this.pathResolver!.resolveAndValidate(
					targetPath,
					"ApplyPatchHandler.previewPatch.source",
				)
				if (!sourceResolution) {
					return
				}

				const originalContent = provider.originalContent
				if (originalContent === undefined) {
					return
				}

				stream.content = originalContent
				break
			}
			case PatchActionType.DELETE:
				stream.content = ""
				provider.editType = "modify"
				break
			default:
				return
		}

		if (stream.content === undefined) {
			return
		}
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const provider = config.services.diffViewProvider
		const rawInput = block.params.input

		if (!rawInput) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(block.name, "input")
		}

		config.taskState.consecutiveMistakeCount = 0
		this.initializeHelpers(config)

		if (provider.isEditing) {
			try {
				await provider.reset()
			} catch {
				// Ignore reset errors
			}
		}

		try {
			const lines = this.preprocessLines(rawInput)

			const filesToLoad = this.extractFilesForOperations(rawInput, [PATCH_MARKERS.UPDATE, PATCH_MARKERS.DELETE])
			const currentFiles = await this.loadFiles(config, filesToLoad)

			const parser = new PatchParser(lines, currentFiles)
			const { patch, fuzz } = parser.parse()

			const commit = await this.patchToCommit(patch, currentFiles)

			this.config = config

			const changedFiles = Object.keys(commit.changes)
			const messages = await this.generateChangeSummary(commit.changes)

			const finalResponses = []
			const applyResults: Record<string, FileOpsResult> = {}

			const pathToChangeKey = new Map<string, string>()
			for (const [originalPath, change] of Object.entries(commit.changes)) {
				if (change.type === PatchActionType.UPDATE && change.movePath) {
					pathToChangeKey.set(change.movePath, originalPath)
				} else {
					pathToChangeKey.set(originalPath, originalPath)
				}
			}

			for (const message of messages) {
				const messagePath = message.path
				if (!messagePath) {
					continue
				}

				const originalPath = pathToChangeKey.get(messagePath)
				if (!originalPath) {
					continue
				}

				const change = commit.changes[originalPath]
				if (!change) {
					continue
				}

				const operationPath = change.type === PatchActionType.UPDATE && change.movePath ? change.movePath : originalPath

				await this.prepareFileChange(change, operationPath)

				const approved = await this.handleApproval(config, block, message, rawInput, change)
				if (!approved) {
					this.config = undefined
					config.taskState.didRejectTool = true
					await provider.revertChanges()
					await provider.reset()
					return "The user denied this patch operation."
				}

				const fileResult = await this.saveFileChange(change, operationPath)
				if (fileResult) {
					if (change.type === PatchActionType.UPDATE && change.movePath) {
						applyResults[change.movePath] = fileResult
						await this.providerOps!.deleteFile(originalPath)
						applyResults[originalPath] = { deleted: true }
					} else {
						applyResults[originalPath] = fileResult
					}
				}

				await provider.reset()

				finalResponses.push(messagePath)
			}

			for (const changedFilePath of changedFiles) {
				const change = commit.changes[changedFilePath]
				const pathToTrack = change.type === PatchActionType.UPDATE && change.movePath ? change.movePath : changedFilePath
				config.services.fileContextTracker.markFileAsEditedByAeriocode(pathToTrack)
				await config.services.fileContextTracker.trackFileContext(pathToTrack, "aeriocode_edited")

				config.taskState.fileReadCache.delete(resolvePath(config.cwd, pathToTrack).toLowerCase())
				if (change.type === PatchActionType.UPDATE && change.movePath) {
					config.taskState.fileReadCache.delete(resolvePath(config.cwd, changedFilePath).toLowerCase())
				}
			}

			this.config = undefined

			const { providerId, modelId } = getModelInfo(config)

			const responseLines = ["Successfully applied patch to the following files:"]

			for (const [path, result] of Object.entries(applyResults)) {
				if (result.deleted) {
					config.taskState.didEditFile = true
					responseLines.push(`\n${path}: [deleted]`)
				} else {
					if (result.userEdits) {
						responseLines.push(`\nThe user made edits to the file:\n${result.userEdits}\n`)
						await config.callbacks.say(
							"user_feedback_diff",
							JSON.stringify({
								tool: "editedExistingFile",
								path,
								diff: result.userEdits,
							}),
						)

						const change = commit.changes[path] || Object.values(commit.changes).find((c) => c.movePath === path)
						const preSaveContent = result.userEdits ? applyPatch(change?.newContent || "", result.userEdits) : false
						captureAccepted({
							ulid: config.ulid,
							tool: this.name,
							source: "human",
							beforeContent: change?.newContent || "",
							afterContent: preSaveContent || result.finalContent || "",
							providerId,
							modelId,
						})
					}
					if (result.autoFormattingEdits) {
						responseLines.push(`\nAuto-formatting was applied to ${path}:\n${result.autoFormattingEdits}\n`)
					}
					if (result.finalContent) {
						responseLines.push(`\n<final_file_content path="${path}">`)
						responseLines.push(result.finalContent)
						responseLines.push(`</final_file_content>`)
					}
					if (result.newProblemsMessage) {
						responseLines.push(`\n\n${result.newProblemsMessage}`)
					}
				}
			}

			if (fuzz > 0) {
				responseLines.push(`\nNote: Patch applied with fuzz factor ${fuzz}`)
			}

			return responseLines.join("\n")
		} catch (error) {
			await provider.revertChanges()
			throw error
		} finally {
			await provider.reset()
		}
	}

	private preprocessLines(text: string): string[] {
		let lines = text.split("\n").map((line) => line.replace(/\r$/, ""))
		lines = this.stripBashWrapper(lines)

		const hasBegin = lines.length > 0 && lines[0].startsWith(PATCH_MARKERS.BEGIN)
		const hasEnd = lines.length > 0 && lines[lines.length - 1] === PATCH_MARKERS.END

		if (!hasBegin && !hasEnd) {
			return [PATCH_MARKERS.BEGIN, ...lines, PATCH_MARKERS.END]
		}
		if (hasBegin && hasEnd) {
			return lines
		}
		throw new DiffError("Invalid patch text - incomplete sentinels. Try breaking it into smaller patches.")
	}

	private stripBashWrapper(lines: string[]): string[] {
		const result: string[] = []
		let insidePatch = false
		let foundBegin = false
		let foundContent = false

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			if (!insidePatch && BASH_WRAPPERS.some((wrapper) => line.startsWith(wrapper))) {
				continue
			}

			if (line.startsWith(PATCH_MARKERS.BEGIN)) {
				insidePatch = true
				foundBegin = true
				result.push(line)
				continue
			}

			if (line === PATCH_MARKERS.END) {
				insidePatch = false
				result.push(line)
				continue
			}

			const isPatchContent = this.isPatchLine(line)
			if (isPatchContent && i !== lines.length - 1) {
				foundContent = true
			}

			if (insidePatch || (!foundBegin && isPatchContent) || (line === "" && foundContent)) {
				result.push(line)
			}
		}

		while (result.length > 0 && result[result.length - 1] === "") {
			result.pop()
		}

		return !foundBegin && !foundContent ? lines : result
	}

	private isPatchLine(line: string): boolean {
		return (
			line.startsWith(PATCH_MARKERS.ADD) ||
			line.startsWith(PATCH_MARKERS.UPDATE) ||
			line.startsWith(PATCH_MARKERS.DELETE) ||
			line.startsWith(PATCH_MARKERS.MOVE) ||
			line.startsWith(PATCH_MARKERS.SECTION) ||
			line.startsWith("+") ||
			line.startsWith("-") ||
			line.startsWith(" ") ||
			line === "***"
		)
	}

	private extractFilesForOperations(text: string, markers: readonly string[]): string[] {
		const lines = this.stripBashWrapper(text.split("\n"))
		const files: string[] = []

		for (const line of lines) {
			for (const marker of markers) {
				if (line.startsWith(marker)) {
					const file = line.substring(marker.length).trim()
					if (text.trim().endsWith(file)) {
						continue
					}
					files.push(file)
					break
				}
			}
		}

		return files
	}

	private extractAllFiles(text: string): string[] {
		return this.extractFilesForOperations(text, [PATCH_MARKERS.ADD, PATCH_MARKERS.UPDATE, PATCH_MARKERS.DELETE])
	}

	private async loadFiles(config: TaskConfig, filePaths: string[]): Promise<Record<string, string>> {
		const files: Record<string, string> = {}

		for (const filePath of filePaths) {
			const pathResult = resolveWorkspacePath(config, filePath, "ApplyPatchHandler.loadFiles")
			const absolutePath = typeof pathResult === "string" ? pathResult : pathResult.absolutePath
			const resolvedPath = typeof pathResult === "string" ? filePath : pathResult.resolvedPath

			const accessValidation = this.validator.checkAeriocodeIgnorePath(resolvedPath)
			if (!accessValidation.ok) {
				await config.callbacks.say("aeriocodeignore_error", resolvedPath)
				throw new DiffError(`Access denied: ${resolvedPath}`)
			}

			if (!(await fileExistsAtPath(absolutePath))) {
				throw new DiffError(`File not found: ${filePath}`)
			}
			const fileContent = await readFile(absolutePath, "utf8")
			const normalizedContent = fileContent.replace(/\r\n/g, "\n")
			files[filePath] = normalizedContent
		}

		return files
	}

	private async patchToCommit(patch: Patch, originalFiles: Record<string, string>): Promise<Commit> {
		const changes: Record<string, FileChange> = {}

		for (const [path, action] of Object.entries(patch.actions)) {
			const targetResolution = await this.pathResolver!.resolveAndValidate(path, "ApplyPatchHandler.previewPatch")
			if (!targetResolution) {
				continue
			}

			switch (action.type) {
				case PatchActionType.DELETE:
					changes[path] = { type: PatchActionType.DELETE, oldContent: originalFiles[path] }
					break
				case PatchActionType.ADD:
					if (!action.newFile) {
						throw new DiffError("ADD action without file content")
					}
					changes[path] = { type: PatchActionType.ADD, newContent: action.newFile }
					break
				case PatchActionType.UPDATE:
					const startLineNumbers = action.chunks.map((chunk) => chunk.origIndex + 1)
					changes[path] = {
						type: PatchActionType.UPDATE,
						oldContent: originalFiles[path],
						newContent: this.applyChunks(originalFiles[path]!, action.chunks, path),
						movePath: action.movePath,
						startLineNumbers,
					}
					break
			}
		}

		return { changes }
	}

	private applyChunks(content: string, chunks: PatchChunk[], path: string, tryPreserveEscaping = false): string {
		if (chunks.length === 0) {
			return content
		}

		const lines = content.split("\n")
		const result: string[] = []
		let currentIndex = 0

		for (const chunk of chunks) {
			if (chunk.origIndex > lines.length) {
				throw new DiffError(`${path}: chunk.origIndex ${chunk.origIndex} > lines.length ${lines.length}`)
			}
			if (currentIndex > chunk.origIndex) {
				throw new DiffError(`${path}: currentIndex ${currentIndex} > chunk.origIndex ${chunk.origIndex}`)
			}

			result.push(...lines.slice(currentIndex, chunk.origIndex))

			const originalLines = lines.slice(chunk.origIndex, chunk.origIndex + chunk.delLines.length)
			const originalText = originalLines.join("\n")

			const insertedLines = chunk.insLines.map((line) => {
				if (tryPreserveEscaping && originalText) {
					return preserveEscaping(originalText, line)
				}
				return line
			})
			result.push(...insertedLines)

			currentIndex = chunk.origIndex + chunk.delLines.length
		}

		result.push(...lines.slice(currentIndex))

		return result.join("\n")
	}

	private async prepareFileChange(change: FileChange, path: string): Promise<void> {
		const ops = this.providerOps!

		switch (change.type) {
			case PatchActionType.DELETE:
				await ops.deleteFile(path, false)
				break
			case PatchActionType.ADD:
				if (!change.newContent) {
					throw new DiffError(`Cannot create ${path} with no content`)
				}
				await ops.createFile(path, change.newContent, false)
				break
			case PatchActionType.UPDATE:
				if (!change.newContent) {
					throw new DiffError(`UPDATE change for ${path} has no new content`)
				}
				if (change.movePath) {
					await ops.createFile(change.movePath, change.newContent, false)
				} else {
					await ops.modifyFile(path, change.newContent, false)
				}
				break
		}
	}

	private async saveFileChange(change: FileChange, path: string): Promise<FileOpsResult | undefined> {
		const ops = this.providerOps!

		switch (change.type) {
			case PatchActionType.DELETE:
				await ops.deleteFile(path)
				return { deleted: true }
			case PatchActionType.ADD:
				if (!change.newContent) {
					throw new DiffError(`Cannot create ${path} with no content`)
				}
				return await ops.saveChanges()
			case PatchActionType.UPDATE:
				if (!change.newContent) {
					throw new DiffError(`UPDATE change for ${path} has no new content`)
				}
				return await ops.saveChanges()
		}
	}

	private async generateChangeSummary(changes: Record<string, FileChange>): Promise<AeriocodeSayTool[]> {
		const summaries = await Promise.all(
			Object.entries(changes).map(async ([file, change]) => {
				const operationIsLocatedInWorkspace = await isLocatedInWorkspace(file)
				switch (change.type) {
					case PatchActionType.ADD:
						return {
							tool: "newFileCreated",
							path: file,
							content: change.newContent,
							operationIsLocatedInWorkspace,
						} as AeriocodeSayTool
					case PatchActionType.UPDATE:
						return {
							tool: change.movePath ? "newFileCreated" : "editedExistingFile",
							path: change.movePath || file,
							content: change.movePath ? change.oldContent : change.newContent,
							operationIsLocatedInWorkspace,
						} as AeriocodeSayTool
					case PatchActionType.DELETE:
						return {
							tool: "fileDeleted",
							path: file,
							content: change.newContent,
							operationIsLocatedInWorkspace,
						} as AeriocodeSayTool
				}
			}),
		)

		return summaries
	}

	private async handleApproval(
		config: TaskConfig,
		block: ToolUse,
		message: AeriocodeSayTool,
		rawInput: string,
		change?: FileChange,
	): Promise<boolean> {
		const patch = { ...message, content: rawInput }
		const completeMessage = JSON.stringify(patch)
		const shouldAutoApprove = await config.callbacks.shouldAutoApproveToolWithPath(block.name, message.path)

		const { providerId, modelId } = getModelInfo(config)

		const fileOps = change
			? {
					filesCreated: change.type === PatchActionType.ADD ? 1 : 0,
					filesDeleted: change.type === PatchActionType.DELETE ? 1 : 0,
					filesMoved: change.type === PatchActionType.UPDATE && change.movePath ? 1 : 0,
				}
			: { filesCreated: 0, filesDeleted: 0, filesMoved: 0 }

		if (shouldAutoApprove) {
			await config.callbacks.removeLastPartialMessageIfExistsWithType("ask", "tool")
			await config.callbacks.say("tool", completeMessage, undefined, undefined, false)
			telemetryService.captureToolUsage(config.ulid, this.name, modelId, true, true)
			captureAccepted({
				ulid: config.ulid,
				tool: this.name,
				source: "agent",
				beforeContent: change?.oldContent || "",
				afterContent: change?.newContent || "",
				providerId,
				modelId,
				...fileOps,
			})
			return true
		}

		showNotificationForApprovalIfAutoApprovalEnabled(
			`AerioCode wants to edit '${message.path}'`,
			config.autoApprovalSettings.enableNotifications,
			true,
		)

		await config.callbacks.removeLastPartialMessageIfExistsWithType("say", "tool")
		const { response, text, images, files } = await config.callbacks.ask("tool", completeMessage, false)

		if (text || images?.length || files?.length) {
			const fileContent = files?.length ? await processFilesIntoText(files) : ""
			ToolResultUtils.pushAdditionalToolFeedback(config.taskState.userMessageContent, text, images, fileContent)
			await config.callbacks.say("user_feedback", text, images, files)
		}

		const approved = response === "yesButtonClicked"
		config.taskState.didRejectTool = !approved
		telemetryService.captureToolUsage(config.ulid, this.name, modelId, false, approved)

		if (approved) {
			captureAccepted({
				ulid: config.ulid,
				tool: this.name,
				source: "agent",
				beforeContent: change?.oldContent || "",
				afterContent: change?.newContent || "",
				providerId,
				modelId,
				...fileOps,
			})
		} else {
			captureRejected({
				ulid: config.ulid,
				tool: this.name,
				source: "agent",
				beforeContent: change?.oldContent || "",
				afterContent: change?.newContent || "",
				providerId,
				modelId,
				...fileOps,
			})
		}

		return approved
	}
}
