import { Anthropic } from "@anthropic-ai/sdk"
import * as diff from "diff"
import * as path from "path"
import { AeriocodeIgnoreController, LOCK_TEXT_SYMBOL } from "../ignore/AeriocodeIgnoreController"
import { toolParamNames, toolUseNames } from "../assistant-message"
import { Mode } from "@/shared/storage/types"

/** Sentinel tag for a call made in JSON function-call dialect, which has no XML tag to name. */
export const JSON_TOOL_CALL = "JSON tool call"

export const formatResponse = {
	duplicateFileReadNotice: () =>
		`[[NOTE] This file read has been removed to save space in the context window. Refer to the latest file read for the most up to date version of this file.]`,

	contextTruncationNotice: () =>
		`[NOTE] Some previous conversation history with the user has been removed to maintain optimal context window length. The initial user task and the most recent exchanges have been retained for continuity, while intermediate conversation history has been removed. Please keep this in mind as you continue assisting the user.`,

	condense: () =>
		`The user has accepted the condensed conversation summary you generated. This summary covers important details of the historical conversation with the user which has been truncated.\n<explicit_instructions type="condense_response">It's crucial that you respond by ONLY asking the user what you should work on next. You should NOT take any initiative or make any assumptions about continuing with work. For example you should NOT suggest file changes or attempt to read any files.\nWhen asking the user what you should work on next, you can reference information in the summary which was just generated. However, you should NOT reference information outside of what's contained in the summary for this response. Keep this response CONCISE.</explicit_instructions>`,

	toolDenied: () => `The user denied this operation.`,

	toolError: (error?: string) => `The tool execution failed with the following error:\n<error>\n${error}\n</error>`,

	aeriocodeIgnoreError: (path: string) =>
		`Access to ${path} is blocked by the .aeriocodeignore file settings. You must try to continue in the task without using this file, or ask the user to update the .aeriocodeignore file.`,

	incompleteToolUse: () =>
		`[ERROR] Your previous response ended in the middle of a tool call — its closing tag never arrived — so the call was incomplete and has been discarded. Nothing was written.

Retry the tool call, and make sure it is closed: every parameter tag and the tool tag itself.
(This is an automated message, so do not respond to it conversationally.)`,

	responseTruncated: () =>
		`[ERROR] Your previous response was cut off because it reached the output length limit, so any tool call it contained was incomplete and has been discarded. Nothing was written.

Retry, and make the response fit: write one file per turn, and spend the budget on the file rather than on restating the rules or the plan before it. If the file is genuinely too large for one turn, create it with its structure first and fill in sections with follow-up edits.
(This is an automated message, so do not respond to it conversationally.)`,

	noToolsUsed: () =>
		`[ERROR] You did not use a tool in your previous response! Please retry with a tool use.

${toolUseInstructionsReminder}

# Next Steps

If you have completed the user's task, use the attempt_completion tool. 
If you require additional information from the user, use the ask_followup_question tool. 
Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. 
(This is an automated message, so do not respond to it conversationally.)`,

	tooManyMistakes: (feedback?: string) =>
		`You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${feedback}\n</feedback>`,

	autoApprovalMaxReached: (feedback?: string) =>
		`Auto-approval limit reached. The user has provided the following feedback to help guide you:\n<feedback>\n${feedback}\n</feedback>`,

	missingToolParameterError: (paramName: string, toolName?: string) => {
		// Tool-specific format examples help the model self-correct.
		const toolSpecificHint = toolName ? correctCallExample(toolName) : ""
		return `Missing value for required parameter '${paramName}'. Please retry with complete response.${toolSpecificHint}\n\n${toolUseInstructionsReminder}`
	},

	/**
	 * A tool call whose opening tag names something that is not a tool.
	 *
	 * ⚠️ Replaces {@link noToolsUsed} for this case, because that message is false here and being
	 * false is what makes it expensive. In a real session the model answered "write me a c++ pid
	 * controller loop" with `<writing_to_file><path>…</path><content>…</content>` — a complete,
	 * correct file under a tag name it invented. Told only "you did not use a tool", it had nothing
	 * to correct: it had used one. It then spent four turns reading a file it had not written and
	 * re-reading one it had, before recovering by chance.
	 *
	 * So the message names the tag it actually sent. A model that is told "you did nothing" cannot
	 * find a spelling mistake; a model that is told "`<writing_to_file>` is not a tool" can.
	 */
	malformedToolUse: (tag: string, suggestedTool?: string) => {
		const correction = suggestedTool
			? `Judging by its parameters you meant \`${suggestedTool}\`.${correctCallExample(suggestedTool)}`
			: `Valid tool names are: ${toolUseNames.join(", ")}.`

		// The JSON dialect needs a different opening sentence: "`<JSON tool call>` is not a tool"
		// would be gibberish, and the correction it needs is about the *format*, not the name.
		if (tag === JSON_TOOL_CALL) {
			return `[ERROR] Your response used JSON function-call format. This API does not accept it, so nothing was executed and nothing was written.

Tools here are called with XML-style tags: the tool name is the tag, and each parameter is its own tag inside it. ${correction}

Retry using the XML form.
(This is an automated message, so do not respond to it conversationally.)`
		}

		return `[ERROR] \`<${tag}>\` is not a tool. Nothing was executed and nothing was written.

The tool name is the tag itself — there is no wrapper element around it, and the name must match exactly. ${correction}

Retry with the correct tool name.
(This is an automated message, so do not respond to it conversationally.)`
	},

	invalidMcpToolArgumentError: (serverName: string, toolName: string) =>
		`Invalid JSON argument used with ${serverName} for ${toolName}. Please retry with a properly formatted JSON argument.`,

	toolResult: (
		text: string,
		images?: string[],
		fileString?: string,
	): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> => {
		let toolResultOutput = []

		if (!(images && images.length > 0) && !fileString) {
			return text
		}

		const textBlock: Anthropic.TextBlockParam = { type: "text", text }
		toolResultOutput.push(textBlock)

		if (images && images.length > 0) {
			const imageBlocks: Anthropic.ImageBlockParam[] = formatImagesIntoBlocks(images)
			toolResultOutput.push(...imageBlocks)
		}

		if (fileString) {
			const fileBlock: Anthropic.TextBlockParam = { type: "text", text: fileString }
			toolResultOutput.push(fileBlock)
		}

		return toolResultOutput
	},

	imageBlocks: (images?: string[]): Anthropic.ImageBlockParam[] => {
		return formatImagesIntoBlocks(images)
	},

	formatFilesList: (
		absolutePath: string,
		files: string[],
		didHitLimit: boolean,
		aeriocodeIgnoreController?: AeriocodeIgnoreController,
	): string => {
		const sorted = files
			.map((file) => {
				// convert absolute path to relative path
				const relativePath = path.relative(absolutePath, file).toPosix()
				return file.endsWith("/") ? relativePath + "/" : relativePath
			})
			// Sort so files are listed under their respective directories to make it clear what files are children of what directories. Since we build file list top down, even if file list is truncated it will show directories that aeriocode can then explore further.
			.sort((a, b) => {
				const aParts = a.split("/") // only works if we use toPosix first
				const bParts = b.split("/")
				for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
					if (aParts[i] !== bParts[i]) {
						// If one is a directory and the other isn't at this level, sort the directory first
						if (i + 1 === aParts.length && i + 1 < bParts.length) {
							return -1
						}
						if (i + 1 === bParts.length && i + 1 < aParts.length) {
							return 1
						}
						// Otherwise, sort alphabetically
						return aParts[i].localeCompare(bParts[i], undefined, {
							numeric: true,
							sensitivity: "base",
						})
					}
				}
				// If all parts are the same up to the length of the shorter path,
				// the shorter one comes first
				return aParts.length - bParts.length
			})

		const aeriocodeIgnoreParsed = aeriocodeIgnoreController
			? sorted.map((filePath) => {
					// path is relative to absolute path, not cwd
					// validateAccess expects either path relative to cwd or absolute path
					// otherwise, for validating against ignore patterns like "assets/icons", we would end up with just "icons", which would result in the path not being ignored.
					const absoluteFilePath = path.resolve(absolutePath, filePath)
					const isIgnored = !aeriocodeIgnoreController.validateAccess(absoluteFilePath)
					if (isIgnored) {
						return LOCK_TEXT_SYMBOL + " " + filePath
					}

					return filePath
				})
			: sorted

		if (didHitLimit) {
			return `${aeriocodeIgnoreParsed.join(
				"\n",
			)}\n\n(File list truncated. Use list_files on specific subdirectories if you need to explore further.)`
		} else if (
			aeriocodeIgnoreParsed.length === 0 ||
			(aeriocodeIgnoreParsed.length === 1 && aeriocodeIgnoreParsed[0] === "")
		) {
			return "No files found."
		} else {
			return aeriocodeIgnoreParsed.join("\n")
		}
	},

	createPrettyPatch: (filename = "file", oldStr?: string, newStr?: string) => {
		// strings cannot be undefined or diff throws exception
		const patch = diff.createPatch(filename.toPosix(), oldStr || "", newStr || "")
		const lines = patch.split("\n")
		const prettyPatchLines = lines.slice(4)
		return prettyPatchLines.join("\n")
	},

	taskResumption: (
		mode: Mode,
		agoText: string,
		cwd: string,
		wasRecent: boolean | 0 | undefined,
		responseText?: string,
		hasPendingFileContextWarnings?: boolean,
	): [string, string] => {
		const taskResumptionMessage = `[TASK RESUMPTION] ${
			mode === "plan"
				? `This task was interrupted ${agoText}. The conversation may have been incomplete. Be aware that the project state may have changed since then. The current working directory is now '${cwd.toPosix()}'.\n\nNote: If you previously attempted a tool use that the user did not provide a result for, you should assume the tool use was not successful. However you are in PLAN MODE, so rather than continuing the task, you must respond to the user's message.`
				: `This task was interrupted ${agoText}. It may or may not be complete, so please reassess the task context. Be aware that the project state may have changed since then. The current working directory is now '${cwd.toPosix()}'. If the task has not been completed, retry the last step before interruption and proceed with completing the task.\n\nNote: If you previously attempted a tool use that the user did not provide a result for, you should assume the tool use was not successful and assess whether you should retry. If the last tool was a browser_action, the browser has been closed and you must launch a new browser if needed.`
		}${
			wasRecent && !hasPendingFileContextWarnings
				? "\n\nIMPORTANT: If the last tool use was a replace_in_file or write_to_file that was interrupted, the file was reverted back to its original state before the interrupted edit, and you do NOT need to re-read the file as you already have its up-to-date contents."
				: ""
		}`

		const userResponseMessage = `${
			responseText
				? `${mode === "plan" ? "New message to respond to with plan_mode_respond tool (be sure to provide your response in the <response> parameter)" : "New instructions for task continuation"}:\n<user_message>\n${responseText}\n</user_message>`
				: mode === "plan"
					? "(The user did not provide a new message. Consider asking them how they'd like you to proceed, or suggest to them to switch to Act mode to continue with the task.)"
					: ""
		}`

		return [taskResumptionMessage, userResponseMessage]
	},

	planModeInstructions: () => {
		return `In this mode you should focus on information gathering, asking questions, and architecting a solution. Once you have a plan, use the plan_mode_respond tool to engage in a conversational back and forth with the user. Do not use the plan_mode_respond tool until you've gathered all the information you need e.g. with read_file or ask_followup_question.
(Remember: If it seems the user wants you to use tools only available in Act Mode, you should ask the user to "toggle to Act mode" (use those words) - they will have to manually do this themselves with the Plan/Act toggle button below. You do not have the ability to switch to Act Mode yourself, and must wait for the user to do it themselves once they are satisfied with the plan. You also cannot present an option to toggle to Act mode, as this will be something you need to direct the user to do manually themselves.)`
	},

	fileEditWithUserChanges: (
		relPath: string,
		userEdits: string,
		autoFormattingEdits: string | undefined,
		finalContent: string | undefined,
		newProblemsMessage: string | undefined,
	) =>
		`The user made the following updates to your content:\n\n${userEdits}\n\n` +
		(autoFormattingEdits
			? `The user's editor also applied the following auto-formatting to your content:\n\n${autoFormattingEdits}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
			: "") +
		`The updated content, which includes both your original modifications and the additional edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file that was saved:\n\n` +
		`<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
		`Please note:\n` +
		`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
		`2. Proceed with the task using this updated file content as the new baseline.\n` +
		`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
		`4. IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including both user edits and any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n` +
		`${newProblemsMessage}`,

	fileEditWithoutUserChanges: (
		relPath: string,
		autoFormattingEdits: string | undefined,
		finalContent: string | undefined,
		newProblemsMessage: string | undefined,
	) =>
		`The content was successfully saved to ${relPath.toPosix()}.\n\n` +
		(autoFormattingEdits
			? `Along with your edits, the user's editor applied the following auto-formatting to your content:\n\n${autoFormattingEdits}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
			: "") +
		`Here is the full, updated content of the file that was saved:\n\n` +
		`<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
		`IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n\n` +
		`${newProblemsMessage}`,

	diffError: (relPath: string, originalContent: string | undefined) =>
		`This is likely because the SEARCH block content doesn't match exactly with what's in the file, or if you used multiple SEARCH/REPLACE blocks they may not have been in the order they appear in the file. (Please also ensure that when using the replace_in_file tool, Do NOT add extra characters to the markers (e.g., ------- SEARCH> is INVALID). Do NOT forget to use the closing +++++++ REPLACE marker. Do NOT modify the marker format in any way. Malformed XML will cause complete tool failure and break the entire editing process.)\n\n` +
		`The file was reverted to its original state:\n\n` +
		`<file_content path="${relPath.toPosix()}">\n${originalContent}\n</file_content>\n\n` +
		`Now that you have the latest state of the file, try the operation again with fewer, more precise SEARCH blocks. For large files especially, it may be prudent to try to limit yourself to <5 SEARCH/REPLACE blocks at a time, then wait for the user to respond with the result of the operation before following up with another replace_in_file call to make additional edits.\n(If you run into this error 3 times in a row, you may use the write_to_file tool as a fallback.)`,

	toolAlreadyUsed: (toolName: string) =>
		`Tool [${toolName}] was not executed because a tool has already been used in this message. Only one tool may be used per message. You must assess the first tool's result before proceeding to use the next tool.`,

	aeriocodeIgnoreInstructions: (content: string) =>
		`# .aeriocodeignore\n\n(The following is provided by a root-level .aeriocodeignore file where the user has specified files and directories that should not be accessed. When using list_files, you'll notice a ${LOCK_TEXT_SYMBOL} next to files that are blocked. Attempting to access the file's contents e.g. through read_file will result in an error.)\n\n${content}\n.aeriocodeignore`,

	aeriocodeRulesGlobalDirectoryInstructions: (globalAeriocodeRulesFilePath: string, content: string) =>
		`# .aeriocoderules/\n\nThe following is provided by a global .aeriocoderules/ directory, located at ${globalAeriocodeRulesFilePath.toPosix()}, where the user has specified instructions for all working directories:\n\n${content}`,

	aeriocodeRulesLocalDirectoryInstructions: (cwd: string, content: string) =>
		`# .aeriocoderules/\n\nThe following is provided by a root-level .aeriocoderules/ directory where the user has specified instructions for this working directory (${cwd.toPosix()})\n\n${content}`,

	aeriocodeRulesLocalFileInstructions: (cwd: string, content: string) =>
		`# .aeriocoderules\n\nThe following is provided by a root-level .aeriocoderules file where the user has specified instructions for this working directory (${cwd.toPosix()})\n\n${content}`,

	windsurfRulesLocalFileInstructions: (cwd: string, content: string) =>
		`# .windsurfrules\n\nThe following is provided by a root-level .windsurfrules file where the user has specified instructions for this working directory (${cwd.toPosix()})\n\n${content}`,

	cursorRulesLocalFileInstructions: (cwd: string, content: string) =>
		`# .cursorrules\n\nThe following is provided by a root-level .cursorrules file where the user has specified instructions for this working directory (${cwd.toPosix()})\n\n${content}`,

	cursorRulesLocalDirectoryInstructions: (cwd: string, content: string) =>
		`# .cursor/rules\n\nThe following is provided by a root-level .cursor/rules directory where the user has specified instructions for this working directory (${cwd.toPosix()})\n\n${content}`,

	fileContextWarning: (editedFiles: string[]): string => {
		const fileCount = editedFiles.length
		const fileVerb = fileCount === 1 ? "file has" : "files have"
		const fileDemonstrativePronoun = fileCount === 1 ? "this file" : "these files"
		const filePersonalPronoun = fileCount === 1 ? "it" : "they"

		return (
			`<explicit_instructions>\nCRITICAL FILE STATE ALERT: ${fileCount} ${fileVerb} been externally modified since your last interaction. Your cached understanding of ${fileDemonstrativePronoun} is now stale and unreliable. Before making ANY modifications to ${fileDemonstrativePronoun}, you must execute read_file to obtain the current state, as ${filePersonalPronoun} may contain completely different content than what you expect:\n` +
			`${editedFiles.map((file) => ` ${path.resolve(file).toPosix()}`).join("\n")}\n` +
			`Failure to re-read before editing will result in replace_in_file edit errors, requiring subsequent attempts and wasting tokens. You DO NOT need to re-read these files after subsequent edits, unless instructed to do so.\n</explicit_instructions>`
		)
	},
}

// to avoid circular dependency
const formatImagesIntoBlocks = (images?: string[]): Anthropic.ImageBlockParam[] => {
	return images
		? images.map((dataUrl) => {
				// data:image/png;base64,base64string
				const [rest, base64] = dataUrl.split(",")
				const mimeType = rest.split(":")[1].split(";")[0]
				return {
					type: "image",
					source: {
						type: "base64",
						media_type: mimeType,
						data: base64,
					},
				} as Anthropic.ImageBlockParam
			})
		: []
}

/**
 * The correct call shape for the tools a model most often gets wrong, keyed by tool name.
 *
 * One copy, used both when a parameter is missing and when the tool name itself is wrong — a second
 * table of "here is how you call it" would drift from this one the first time a tool changed.
 */
const TOOL_CALL_EXAMPLES: Record<string, string> = {
	read_file: `<read_file>\n<path>the/file/path.py</path>\n</read_file>`,
	write_to_file: `<write_to_file>\n<path>the/file/path.py</path>\n<content>\nfile content here\n</content>\n</write_to_file>`,
	replace_in_file: `<replace_in_file>\n<path>the/file/path.py</path>\n<diff>\n------- SEARCH\n[exact text to find]\n=======\n[new text]\n+++++++ REPLACE\n</diff>\n</replace_in_file>`,
	list_files: `<list_files>\n<path>directory/path</path>\n</list_files>`,
	search_files: `<search_files>\n<path>directory/path</path>\n<regex>pattern</regex>\n</search_files>`,
	execute_command: `<execute_command>\n<command>ls -la</command>\n<requires_approval>false</requires_approval>\n</execute_command>`,
	attempt_completion: `<attempt_completion>\n<result>\nwhat was done\n</result>\n</attempt_completion>`,
}

function correctCallExample(toolName: string): string {
	const example = TOOL_CALL_EXAMPLES[toolName]
	return example ? `\n\nCorrect format for ${toolName}:\n${example}` : ""
}

/**
 * Which tool a malformed call was reaching for, decided by the parameters it carried.
 *
 * Deliberately not string distance against the tool names. `writing_to_file` is not a near-miss of
 * `write_to_file` by any edit metric that would not also match half the tool list, whereas the
 * parameters a call carries say what it was trying to do with no fuzziness at all: a `path` and a
 * `content` is a write, a `path` and a `diff` is an edit. A signature matching more than one tool
 * yields nothing rather than a guess, and the caller then lists the valid names instead.
 */
const PARAMETER_SIGNATURES: Array<{ params: string[]; tool: string }> = [
	{ params: ["path", "content"], tool: "write_to_file" },
	{ params: ["path", "diff"], tool: "replace_in_file" },
	{ params: ["path", "regex"], tool: "search_files" },
	{ params: ["command"], tool: "execute_command" },
	{ params: ["result"], tool: "attempt_completion" },
	{ params: ["path"], tool: "read_file" },
]

/**
 * A tag that is not a tool but is being used as one.
 *
 * The signal is structural rather than lexical: an unrecognised tag that directly contains known
 * *parameter* tags is a tool call whose name is wrong, and nothing else looks like that. Prose
 * mentioning `<writing_to_file>` carries no `<path>`; a real tool call is recognised by the parser
 * and never reaches here.
 *
 * @returns the offending tag and the tool it was reaching for, or undefined if this is ordinary text.
 */
export function detectMalformedToolUse(message: string): { tag: string; suggestedTool?: string } | undefined {
	const known = new Set<string>([...toolUseNames, ...toolParamNames])

	// ⚠️ The JSON convention, which this API does not use. Found by the protocol harness: asked to
	// write a file, the model answered `{"tool": "list_files", "tool_input": {"path": "."}}` — the
	// shape every other provider's function calling takes. No XML tag exists, so the turn read as
	// "no tool use" and the model was told it had done nothing, when it had made a well-formed call
	// in the wrong dialect. Naming the dialect is the difference between a correctable mistake and
	// a mystifying one.
	const asJson = message.match(/"(?:tool|name|function|recipient_name)"\s*:\s*"([a-z_]+)"/)
	if (asJson && /"(?:tool_input|arguments|parameters|input)"\s*:/.test(message)) {
		return { tag: JSON_TOOL_CALL, suggestedTool: toolUseNames.includes(asJson[1] as never) ? asJson[1] : undefined }
	}

	// The other JSON shape, where the tool name is the *key* rather than a `name` field:
	// `{"read_file": {"path": "/workspace/bench.c"}}`. Measured on the second run of the protocol
	// harness, so both shapes occur in practice and matching only one leaves the model told it did
	// nothing on half of them. Requires a known tool name and a parameter inside, so an ordinary
	// JSON object in an answer is not mistaken for a call.
	for (const tool of toolUseNames) {
		const keyed = new RegExp(`"${tool}"\\s*:\\s*\\{`)
		if (!keyed.test(message)) {
			continue
		}
		const body = message.slice(message.search(keyed))
		if (toolParamNames.some((param) => new RegExp(`"${param}"\\s*:`).test(body))) {
			return { tag: JSON_TOOL_CALL, suggestedTool: tool }
		}
	}

	for (const match of message.matchAll(/<([a-z][a-z0-9_]*)>/g)) {
		const tag = match[1]
		if (known.has(tag)) {
			continue
		}
		// Look only as far as this tag's own close, so parameters belonging to a later, correctly
		// named call are not attributed to it.
		const bodyStart = (match.index ?? 0) + match[0].length
		const bodyEnd = message.indexOf(`</${tag}>`, bodyStart)
		const body = message.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd)

		const carried = toolParamNames.filter((param) => body.includes(`<${param}>`))
		if (carried.length === 0) {
			continue
		}

		const candidates = PARAMETER_SIGNATURES.filter((signature) =>
			signature.params.every((param) => carried.includes(param as (typeof toolParamNames)[number])),
		)
		return { tag, suggestedTool: candidates.length > 0 ? candidates[0].tool : undefined }
	}

	return undefined
}

const toolUseInstructionsReminder = `# Reminder: Instructions for Tool Use

Tool uses are formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

For example:

<attempt_completion>
<result>
I have completed the task...
</result>
</attempt_completion>

Always adhere to this format for all tool uses to ensure proper parsing and execution.`
