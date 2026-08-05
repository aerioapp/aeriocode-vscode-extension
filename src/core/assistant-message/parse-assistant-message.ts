import { AssistantMessageContent, TextContent, ToolUse, ToolParamName, toolParamNames, toolUseNames, ToolUseName } from "." // Assuming types are defined in index.ts or a similar file

// parseAssistantmessageV1 removed in https://github.com/aerioapp/aeriocode-vscode-extension/pull/5425

/**
 * A closing tag that names the wrong tool, where it can only have meant to close the open one.
 *
 * ⚠️ Observed in a real session (`write me a c++ pid controller loop`): the model opened
 * `<write_to_file>`, wrote the path and the full content, closed `</content>` — and then closed the
 * call with **`</read_file>`**, the tool it had used one turn earlier. Nothing matched
 * `</write_to_file>`, so the block stayed partial and was discarded at end of stream, and the model
 * was told its response "ended in the middle of a tool call". From where it sat that was false — it
 * had closed the call — so it resent the identical response, twice, and only recovered by chance on
 * the third attempt. Three round trips and a complete file thrown away each time.
 *
 * Recovering it is unambiguous. This is only reached once the parameter has closed, so the tag is
 * not inside a value; a foreign tool's closing tag loose in a tool body has no other reading.
 *
 * The guard mirrors the `</parameter>`-for-`</content>` tolerance already below: if the *correct*
 * closing tag turns up later, this is not the close and we keep looking. That is what keeps a model
 * that writes prose about `</read_file>` between two real calls from having the first one closed
 * early.
 *
 * @returns the matched closing tag, or undefined when this position does not close the tool.
 */
function mismatchedToolCloseTagAt(message: string, index: number, openTool: ToolUseName): string | undefined {
	// Called per character while inside a tool body, so reject the overwhelming majority before
	// doing any work.
	if (message[index] !== ">") {
		return undefined
	}

	// ⚠️ Any closing tag, not only another tool's. The first version of this accepted only
	// `</known_tool>`, which covered the reported `</read_file>` and nothing else — and the protocol
	// harness immediately found `<execute_command><command>…</command></function>`, where the model
	// had reached for the Anthropic function-call convention's closer. Enumerating the wrong closers
	// a model might invent is a losing game; what identifies the close is the *position*, not the
	// name. Nothing but a close belongs here.
	const start = message.lastIndexOf("</", index)
	if (start === -1 || !/^<\/[A-Za-z][\w.-]*>$/.test(message.slice(start, index + 1))) {
		return undefined
	}

	const tag = message.slice(start, index + 1)
	if (tag === `</${openTool}>`) {
		return undefined
	}
	// ⚠️ Not a parameter's closing tag. The parameter branch above deliberately does *not* advance
	// the index when it closes a value — "need to check for tool close or other params at index i" —
	// so this function is called at the `>` of `</path>` and `</content>` on every well-formed call.
	// Treating those as the tool's close ended the call at its first parameter and dropped every
	// parameter after it.
	if (toolParamNames.some((param) => tag === `</${param}>`)) {
		return undefined
	}
	// Only when the tool's own closing tag never arrives — otherwise that one is the close, and
	// consuming this position would truncate the parameters between here and there.
	return message.includes(`</${openTool}>`, index + 1) ? undefined : tag
}

/**
 * @description **Version 2**
 * Parses an assistant message string potentially containing mixed text and tool usage blocks
 * marked with XML-like tags into an array of structured content objects.
 *
 * This version aims for efficiency by avoiding the character-by-character accumulator of V1.
 * It iterates through the string using an index `i`. At each position, it checks if the substring
 * *ending* at `i` matches any known opening or closing tags for tools or parameters using `startsWith`
 * with an offset.
 * It uses pre-computed Maps (`toolUseOpenTags`, `toolParamOpenTags`) for quick tag lookups.
 * State is managed using indices (`currentTextContentStart`, `currentToolUseStart`, `currentParamValueStart`)
 * pointing to the start of the current block within the original `assistantMessage` string.
 * Slicing is used to extract content only when a block (text, parameter, or tool use) is completed.
 * Special handling for `write_to_file` and `new_rule` content parameters is included, using `indexOf`
 * and `lastIndexOf` on the relevant slice to handle potentially nested closing tags.
 * If the input string ends mid-block, the last open block is added and marked as partial.
 *
 * @param assistantMessage The raw string output from the assistant.
 * @returns An array of `AssistantMessageContent` objects, which can be `TextContent` or `ToolUse`.
 *          Blocks that were not fully closed by the end of the input string will have their `partial` flag set to `true`.
 */
/**
 * Parameters whose value is arbitrary text, so a literal `</parameter>` inside one may be content
 * rather than a mis-closed tag.
 *
 * For these, a `</parameter>` is only taken as the close when the parameter's own closing tag never
 * arrives. Every other parameter is a short scalar — a path, a URL, an action name — where the
 * literal has no business appearing, so the first `</parameter>` is the close outright.
 *
 * ⚠️ Deferring for *all* parameters is what made the fix ineffective on the observed case:
 * `<action>go_to_url</parameter><parameter>url…</action>` does eventually carry `</action>`, so the
 * deferral fired and `action` swallowed the whole rest of the call — which is the failure being
 * fixed, restored by the guard meant to make the fix safe.
 */
const FREE_TEXT_PARAMS: ReadonlySet<string> = new Set(["content", "diff"])

export function parseAssistantMessageV2(assistantMessage: string): AssistantMessageContent[] {
	const contentBlocks: AssistantMessageContent[] = []
	let currentTextContentStart = 0 // Index where the current text block started
	let currentTextContent: TextContent | undefined = undefined
	let currentToolUseStart = 0 // Index *after* the opening tag of the current tool use
	let currentToolUse: ToolUse | undefined = undefined
	let currentParamValueStart = 0 // Index *after* the opening tag of the current param
	let currentParamName: ToolParamName | undefined = undefined

	// Precompute tags for faster lookups
	const toolUseOpenTags = new Map<string, ToolUseName>()
	const toolParamOpenTags = new Map<string, ToolParamName>()
	for (const name of toolUseNames) {
		toolUseOpenTags.set(`<${name}>`, name)
	}
	for (const name of toolParamNames) {
		toolParamOpenTags.set(`<${name}>`, name)
	}

	const len = assistantMessage.length
	for (let i = 0; i < len; i++) {
		const currentCharIndex = i

		// --- State: Parsing a Tool Parameter ---
		if (currentToolUse && currentParamName) {
			const closeTag = `</${currentParamName}>`
			// Check if the string *ending* at index `i` matches the closing tag
			if (
				currentCharIndex >= closeTag.length - 1 &&
				assistantMessage.startsWith(
					closeTag,
					currentCharIndex - closeTag.length + 1, // Start checking from potential start of tag
				)
			) {
				// Found the closing tag for the parameter
				const value = assistantMessage
					.slice(
						currentParamValueStart, // Start after the opening tag
						currentCharIndex - closeTag.length + 1, // End before the closing tag
					)
					.trim()
				currentToolUse.params[currentParamName] = value
				currentParamName = undefined // Go back to parsing tool content
				// We don't continue loop here, need to check for tool close or other params at index i
			} else if (
				// Handle mismatched closing tags: the model closes a parameter with `</parameter>`,
				// the Anthropic function-call dialect's closer, instead of the parameter's own name.
				//
				// ⚠️ This was restricted to `write_to_file`'s `content`, and a real session showed why
				// that is not where it happens. Asked about a coding standard it had never been told
				// about, the model reached for the browser and wrote
				// `<browser_action><action>go_to_url</parameter><parameter>url…`, so `action` swallowed
				// the rest of the call and came out as a value no executor could use. Dialect mixing is
				// a property of the model, not of one tool and one parameter.
				currentCharIndex >= 10 &&
				assistantMessage.startsWith("</parameter>", currentCharIndex - 10)
			) {
				// Check if the correct closing tag exists later in the string
				const remainingAfterThis = assistantMessage.slice(currentCharIndex + 1)
				if (!FREE_TEXT_PARAMS.has(currentParamName) || !remainingAfterThis.includes(`</${currentParamName}>`)) {
					// No correct closing tag found later - treat the mismatched tag as the close tag
					const value = assistantMessage.slice(currentParamValueStart, currentCharIndex - 10).trim()
					currentToolUse.params[currentParamName] = value
					currentParamName = undefined
				} else {
					continue // Correct closing tag exists later, keep looking
				}
			} else {
				continue // Still inside param value, move to next char
			}
		}

		// --- State: Parsing a Tool Use (but not a specific parameter) ---
		if (currentToolUse && !currentParamName) {
			// Ensure we are not inside a parameter already
			// Check if starting a new parameter
			let startedNewParam = false
			for (const [tag, paramName] of toolParamOpenTags.entries()) {
				if (currentCharIndex >= tag.length - 1 && assistantMessage.startsWith(tag, currentCharIndex - tag.length + 1)) {
					currentParamName = paramName
					currentParamValueStart = currentCharIndex + 1 // Value starts after the tag
					startedNewParam = true
					break
				}
			}
			if (startedNewParam) {
				continue // Handled start of param, move to next char
			}

			// Check if closing the current tool use — either by its own name, or by another tool's
			// closing tag when that is the only close the model sent (see mismatchedToolCloseTagAt).
			const ownCloseTag = `</${currentToolUse.name}>`
			const toolCloseTag =
				currentCharIndex >= ownCloseTag.length - 1 &&
				assistantMessage.startsWith(ownCloseTag, currentCharIndex - ownCloseTag.length + 1)
					? ownCloseTag
					: mismatchedToolCloseTagAt(assistantMessage, currentCharIndex, currentToolUse.name)
			if (toolCloseTag) {
				// End of the tool use found
				// Special handling for content params *before* finalizing the tool
				const toolContentSlice = assistantMessage.slice(
					currentToolUseStart, // From after the tool opening tag
					currentCharIndex - toolCloseTag.length + 1, // To before the tool closing tag
				)

				// Check if content parameter needs special handling (write_to_file/new_rule)
				// This check is important if the closing </content> tag was missed by the parameter parsing logic
				// (e.g., if content is empty or parsing logic prioritizes tool close)
				const contentParamName: ToolParamName = "content"
				if (
					currentToolUse.name === "write_to_file" /* || currentToolUse.name === "new_rule" */ &&
					toolContentSlice.includes(`<${contentParamName}>`)
				) {
					const contentStartTag = `<${contentParamName}>`
					const contentEndTag = `</${contentParamName}>`
					const contentStart = toolContentSlice.indexOf(contentStartTag)
					// Use lastIndexOf for robustness against nested tags
					const contentEnd = toolContentSlice.lastIndexOf(contentEndTag)

					if (contentStart !== -1 && contentEnd !== -1 && contentEnd > contentStart) {
						const contentValue = toolContentSlice.slice(contentStart + contentStartTag.length, contentEnd).trim()
						currentToolUse.params[contentParamName] = contentValue
					}
				}
				// Fallback: also check for alt opening tag
				if (
					!currentToolUse.params[contentParamName] &&
					currentToolUse.name === "write_to_file" &&
					toolContentSlice.includes("<parameter>")
				) {
					const altStart = toolContentSlice.indexOf("<parameter>")
					const altEnd = toolContentSlice.lastIndexOf("</parameter>")
					if (altStart !== -1 && altEnd !== -1 && altEnd > altStart) {
						const contentValue = toolContentSlice.slice(altStart + 10, altEnd).trim()
						currentToolUse.params[contentParamName] = contentValue
					}
				}

				currentToolUse.partial = false // Mark as complete
				contentBlocks.push(currentToolUse)
				currentToolUse = undefined // Reset state
				currentTextContentStart = currentCharIndex + 1 // Potential text starts after this tag
				continue // Move to next char
			}
			// If not starting a param and not closing the tool, continue accumulating tool content implicitly
			continue
		}

		// --- State: Parsing Text / Looking for Tool Start ---
		if (!currentToolUse) {
			// Check if starting a new tool use
			let startedNewTool = false
			for (const [tag, toolName] of toolUseOpenTags.entries()) {
				if (currentCharIndex >= tag.length - 1 && assistantMessage.startsWith(tag, currentCharIndex - tag.length + 1)) {
					// End current text block if one was active
					if (currentTextContent) {
						currentTextContent.content = assistantMessage
							.slice(
								currentTextContentStart, // From where text started
								currentCharIndex - tag.length + 1, // To before the tool tag starts
							)
							.trim()
						currentTextContent.partial = false // Ended because tool started
						if (currentTextContent.content.length > 0) {
							contentBlocks.push(currentTextContent)
						}
						currentTextContent = undefined
					} else {
						// Check for any text between the last block and this tag
						const potentialText = assistantMessage
							.slice(
								currentTextContentStart, // From where text *might* have started
								currentCharIndex - tag.length + 1, // To before the tool tag starts
							)
							.trim()
						if (potentialText.length > 0) {
							contentBlocks.push({
								type: "text",
								content: potentialText,
								partial: false,
							})
						}
					}

					// Start the new tool use
					currentToolUse = {
						type: "tool_use",
						name: toolName,
						params: {},
						partial: true, // Assume partial until closing tag is found
					}
					currentToolUseStart = currentCharIndex + 1 // Tool content starts after the opening tag
					startedNewTool = true
					break
				}
			}

			if (startedNewTool) {
				continue // Handled start of tool, move to next char
			}

			// If not starting a tool, it must be text content
			if (!currentTextContent) {
				// Start a new text block if we aren't already in one
				currentTextContentStart = currentCharIndex // Text starts at the current character
				// Check if the current char is the start of potential text *immediately* after a tag
				// This needs the previous state - simpler to let slicing handle it later.
				// Resetting start index accurately is key.
				// It should be the index *after* the last processed tag.
				// The logic managing currentTextContentStart after closing tags handles this.

				currentTextContent = {
					type: "text",
					content: "", // Will be determined by slicing at the end or when a tool starts
					partial: true,
				}
			}
			// Continue accumulating text implicitly; content is extracted later.
		}
	} // End of loop

	// --- Finalization after loop ---

	// Finalize any open parameter within an open tool use
	if (currentToolUse && currentParamName) {
		currentToolUse.params[currentParamName] = assistantMessage
			.slice(currentParamValueStart) // From param start to end of string
			.trim()
		// Tool use remains partial
	}

	// Finalize any open tool use (which might contain the finalized partial param)
	if (currentToolUse) {
		// Tool use is partial because the loop finished before its closing tag
		contentBlocks.push(currentToolUse)
	}
	// Finalize any trailing text content
	// Only possible if a tool use wasn't open at the very end
	else if (currentTextContent) {
		currentTextContent.content = assistantMessage
			.slice(currentTextContentStart) // From text start to end of string
			.trim()
		// Text is partial because the loop finished
		if (currentTextContent.content.length > 0) {
			contentBlocks.push(currentTextContent)
		}
	}

	return contentBlocks
}

export function parseAssistantMessageV3(assistantMessage: string): AssistantMessageContent[] {
	const contentBlocks: AssistantMessageContent[] = []
	let currentTextContentStart = 0 // Index where the current text block started
	let currentTextContent: TextContent | undefined = undefined
	let currentToolUseStart = 0 // Index *after* the opening tag of the current tool use
	let currentToolUse: ToolUse | undefined = undefined
	let currentParamValueStart = 0 // Index *after* the opening tag of the current param
	let currentParamName: ToolParamName | undefined = undefined

	// Precompute tags for faster lookups
	const toolUseOpenTags = new Map<string, ToolUseName>()
	const toolParamOpenTags = new Map<string, ToolParamName>()
	for (const name of toolUseNames) {
		toolUseOpenTags.set(`<${name}>`, name)
	}
	for (const name of toolParamNames) {
		toolParamOpenTags.set(`<${name}>`, name)
	}

	// Function calls format detection
	const isFunctionCallsOpen = "<function_calls>"
	const isFunctionCallsClose = "</function_calls>"
	const isInvokeStart = '<invoke name="'
	const isInvokeEnd = '">'
	const isInvokeClose = "</invoke>"
	const isParameterStart = '<parameter name="'
	const isParameterNameEnd = '">'
	const isParameterClose = "</parameter>"

	// Variables for function calls parsing
	let inFunctionCalls = false
	let currentInvokeName = ""
	let currentParameterName = ""

	const len = assistantMessage.length
	for (let i = 0; i < len; i++) {
		const currentCharIndex = i

		// --- State: Parsing Function Calls ---
		// Check for opening function_calls tag
		//
		// ⚠️ `!currentToolUse && !currentParamName` — without them this branch fires on the literal
		// string `<function_calls>` appearing *inside* a parameter value, because it is tested first
		// in the loop and was guarded only against re-entry. A `write_to_file` whose content mentioned
		// the tag flipped the parser into function-call mode mid-value, the tool use never closed, and
		// the write was discarded at end of stream with the model told its response was cut off.
		//
		// So asking this extension to write a file about tool calling — documentation, a prompt
		// template, an XML fixture — destroyed that file, and only for the next-gen model families
		// that select V3. Found by the protocol harness reporting a V2/V3 divergence on a live
		// answer; the two parsers disagreeing is the whole reason it runs both.
		if (
			!inFunctionCalls &&
			!currentToolUse &&
			!currentParamName &&
			currentCharIndex >= isFunctionCallsOpen.length - 1 &&
			assistantMessage.startsWith(isFunctionCallsOpen, currentCharIndex - isFunctionCallsOpen.length + 1)
		) {
			// End current text block if one was active
			if (currentTextContent) {
				currentTextContent.content = assistantMessage
					.slice(currentTextContentStart, currentCharIndex - isFunctionCallsOpen.length + 1)
					.trim()
				currentTextContent.partial = false
				if (currentTextContent.content.length > 0) {
					contentBlocks.push(currentTextContent)
				}
				currentTextContent = undefined
			}

			inFunctionCalls = true
			continue
		}

		// Check for invoke start within function_calls
		if (
			inFunctionCalls &&
			currentInvokeName === "" &&
			!currentToolUse && // Don't create a new tool if we already have one
			currentCharIndex >= isInvokeStart.length - 1 &&
			assistantMessage.startsWith(isInvokeStart, currentCharIndex - isInvokeStart.length + 1)
		) {
			// Find the end of the invoke name
			const nameEndPos = assistantMessage.indexOf(isInvokeEnd, currentCharIndex + 1)
			if (nameEndPos !== -1) {
				// Extract the invoke name
				currentInvokeName = assistantMessage.slice(currentCharIndex + 1, nameEndPos)
				i = nameEndPos + isInvokeEnd.length - 1 // Skip to after the '">

				// If this is an LS invoke, create a list_files tool
				if (currentInvokeName === "LS") {
					currentToolUse = {
						type: "tool_use",
						name: "list_files",
						params: {},
						partial: true,
					}
				}

				// If this is a Grep invoke, create a search_files tool
				if (currentInvokeName === "Grep") {
					currentToolUse = {
						type: "tool_use",
						name: "search_files",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "Bash") {
					currentToolUse = {
						type: "tool_use",
						name: "execute_command",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "Read") {
					currentToolUse = {
						type: "tool_use",
						name: "read_file",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "Write") {
					currentToolUse = {
						type: "tool_use",
						name: "write_to_file",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "WebFetch") {
					currentToolUse = {
						type: "tool_use",
						name: "web_fetch",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "AskQuestion") {
					currentToolUse = {
						type: "tool_use",
						name: "ask_followup_question",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "ComplianceCheck") {
					currentToolUse = {
						type: "tool_use",
						name: "compliance_check",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "UseMCPTool") {
					currentToolUse = {
						type: "tool_use",
						name: "use_mcp_tool",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "AccessMCPResource") {
					currentToolUse = {
						type: "tool_use",
						name: "access_mcp_resource",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "ListCodeDefinitionNames") {
					currentToolUse = {
						type: "tool_use",
						name: "list_code_definition_names",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "PlanModeRespond") {
					currentToolUse = {
						type: "tool_use",
						name: "plan_mode_respond",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "LoadMcpDocumentation") {
					currentToolUse = {
						type: "tool_use",
						name: "load_mcp_documentation",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "AttemptCompletion") {
					currentToolUse = {
						type: "tool_use",
						name: "attempt_completion",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "BrowserAction") {
					currentToolUse = {
						type: "tool_use",
						name: "browser_action",
						params: {},
						partial: true,
					}
				}

				if (currentInvokeName === "NewTask") {
					currentToolUse = {
						type: "tool_use",
						name: "new_task",
						params: {},
						partial: true,
					}
				}

				// If this is a MultiEdit invoke, create a replace_in_file tool
				if (currentInvokeName === "MultiEdit") {
					currentToolUse = {
						type: "tool_use",
						name: "replace_in_file",
						params: {},
						partial: true,
					}
				}

				continue
			}
		}

		// Check for parameter start within invoke
		if (
			inFunctionCalls &&
			currentInvokeName !== "" &&
			currentParameterName === "" &&
			currentCharIndex >= isParameterStart.length - 1 &&
			assistantMessage.startsWith(isParameterStart, currentCharIndex - isParameterStart.length + 1)
		) {
			// Find the end of the parameter name
			const nameEndPos = assistantMessage.indexOf(isParameterNameEnd, currentCharIndex + 1)
			if (nameEndPos !== -1) {
				// Extract the parameter name
				currentParameterName = assistantMessage.slice(currentCharIndex + 1, nameEndPos)
				currentParamValueStart = nameEndPos + isParameterNameEnd.length
				i = nameEndPos + isParameterNameEnd.length - 1 // Skip to after the '">'
				continue
			}
		}

		// Check for parameter end
		if (
			inFunctionCalls &&
			currentInvokeName !== "" &&
			currentParameterName !== "" &&
			currentCharIndex >= isParameterClose.length - 1 &&
			assistantMessage.startsWith(isParameterClose, currentCharIndex - isParameterClose.length + 1)
		) {
			// Extract parameter value
			const value = assistantMessage.slice(currentParamValueStart, currentCharIndex - isParameterClose.length + 1).trim()

			// Map parameter to tool params
			if (currentToolUse && currentInvokeName === "LS" && currentParameterName === "path") {
				currentToolUse.params["path"] = value
				// Default recursive to false - only show top level
				currentToolUse.params["recursive"] = "false"
			}

			if (currentToolUse && currentInvokeName === "Read" && currentParameterName === "file_path") {
				currentToolUse.params["path"] = value
			}

			if (currentToolUse && currentInvokeName === "PlanModeRespond" && currentParameterName === "response") {
				currentToolUse.params["response"] = value
			}

			if (currentToolUse && currentInvokeName === "WebFetch" && currentParameterName === "url") {
				currentToolUse.params["url"] = value
			}

			if (currentToolUse && currentInvokeName === "ListCodeDefinitionNames" && currentParameterName === "path") {
				currentToolUse.params["path"] = value
			}

			if (currentToolUse && currentInvokeName === "NewTask" && currentParameterName === "context") {
				currentToolUse.params["context"] = value
			}

			// Map parameter to tool params for Grep
			if (currentToolUse && currentInvokeName === "Grep") {
				if (currentParameterName === "pattern") {
					currentToolUse.params["regex"] = value
				} else if (currentParameterName === "path") {
					currentToolUse.params["path"] = value
				} else if (currentParameterName === "include") {
					currentToolUse.params["file_pattern"] = value
				}
			}

			if (currentToolUse && currentInvokeName === "Bash") {
				if (currentParameterName === "command") {
					currentToolUse.params["command"] = value
				} else if (currentParameterName === "requires_approval") {
					currentToolUse.params["requires_approval"] = value === "true" ? "true" : "false"
				}
			}

			if (currentToolUse && currentInvokeName === "Write") {
				if (currentParameterName === "file_path") {
					currentToolUse.params["path"] = value
				} else if (currentParameterName === "content") {
					currentToolUse.params["content"] = value
				}
			}

			if (currentToolUse && currentInvokeName === "AskQuestion") {
				if (currentParameterName === "question") {
					currentToolUse.params["question"] = value
				} else if (currentParameterName === "options") {
					currentToolUse.params["options"] = value
				}
			}

			if (currentToolUse && currentInvokeName === "UseMCPTool") {
				if (currentParameterName === "server_name") {
					currentToolUse.params["server_name"] = value
				} else if (currentParameterName === "tool_name") {
					currentToolUse.params["tool_name"] = value
				} else if (currentParameterName === "arguments") {
					currentToolUse.params["arguments"] = value
				}
			}

			if (currentToolUse && currentInvokeName === "AccessMCPResource") {
				if (currentParameterName === "server_name") {
					currentToolUse.params["server_name"] = value
				} else if (currentParameterName === "uri") {
					currentToolUse.params["uri"] = value
				}
			}

			if (currentToolUse && currentInvokeName === "AttemptCompletion") {
				if (currentParameterName === "result") {
					currentToolUse.params["result"] = value
				}
				if (currentParameterName === "command") {
					currentToolUse.params["command"] = value
				}
			}

			if (currentToolUse && currentInvokeName === "BrowserAction") {
				if (currentParameterName === "action") {
					currentToolUse.params["action"] = value
				} else if (currentParameterName === "url") {
					currentToolUse.params["url"] = value
				} else if (currentParameterName === "coordinate") {
					currentToolUse.params["coordinate"] = value
				} else if (currentParameterName === "text") {
					currentToolUse.params["text"] = value
				}
			}

			// Map parameter to tool params for MultiEdit
			if (currentToolUse && currentInvokeName === "MultiEdit") {
				if (currentParameterName === "file_path") {
					currentToolUse.params["path"] = value
				} else if (currentParameterName === "edits") {
					// Save the value to the diff parameter for replace_in_file
					currentToolUse.params["diff"] = value
				}
			}

			currentParameterName = ""
			continue
		}

		// Check for invoke end
		if (
			inFunctionCalls &&
			currentInvokeName !== "" &&
			currentCharIndex >= isInvokeClose.length - 1 &&
			assistantMessage.startsWith(isInvokeClose, currentCharIndex - isInvokeClose.length + 1)
		) {
			// If we have a tool use from this invoke, finalize it
			if (
				currentToolUse &&
				(currentInvokeName === "LS" ||
					currentInvokeName === "Grep" ||
					currentInvokeName === "Bash" ||
					currentInvokeName === "Read" ||
					currentInvokeName === "Write" ||
					currentInvokeName === "WebFetch" ||
					currentInvokeName === "AskQuestion" ||
					currentInvokeName === "UseMCPTool" ||
					currentInvokeName === "AccessMCPResource" ||
					currentInvokeName === "ListCodeDefinitionNames" ||
					currentInvokeName === "PlanModeRespond" ||
					currentInvokeName === "LoadMcpDocumentation" ||
					currentInvokeName === "AttemptCompletion" ||
					currentInvokeName === "BrowserAction" ||
					currentInvokeName === "NewTask" ||
					currentInvokeName === "MultiEdit")
			) {
				currentToolUse.partial = false
				contentBlocks.push(currentToolUse)
				currentToolUse = undefined
			}
			currentInvokeName = ""
			continue
		}

		// Check for function_calls end
		if (
			inFunctionCalls &&
			currentCharIndex >= isFunctionCallsClose.length - 1 &&
			assistantMessage.startsWith(isFunctionCallsClose, currentCharIndex - isFunctionCallsClose.length + 1)
		) {
			inFunctionCalls = false
			currentTextContentStart = currentCharIndex + 1
			// Start a new text content block for any text after function_calls
			currentTextContent = {
				type: "text",
				content: "",
				partial: true,
			}
			continue
		}

		// Skip normal parsing when inside function_calls
		if (inFunctionCalls) {
			continue
		}

		// --- State: Parsing a Tool Parameter ---
		if (currentToolUse && currentParamName) {
			const closeTag = `</${currentParamName}>`
			// Check if the string *ending* at index `i` matches the closing tag
			if (
				currentCharIndex >= closeTag.length - 1 &&
				assistantMessage.startsWith(
					closeTag,
					currentCharIndex - closeTag.length + 1, // Start checking from potential start of tag
				)
			) {
				// Found the closing tag for the parameter
				const value = assistantMessage
					.slice(
						currentParamValueStart, // Start after the opening tag
						currentCharIndex - closeTag.length + 1, // End before the closing tag
					)
					.trim()
				currentToolUse.params[currentParamName] = value
				currentParamName = undefined // Go back to parsing tool content
				// We don't continue loop here, need to check for tool close or other params at index i
			} else if (currentCharIndex >= 10 && assistantMessage.startsWith("</parameter>", currentCharIndex - 10)) {
				// The same dialect-mixing tolerance V2 carries: `</parameter>` is the Anthropic
				// function-call closer, and a model that reaches for it mid-XML-call otherwise lets one
				// parameter swallow the whole rest of the call. Guarded identically — if the
				// parameter's own closing tag turns up later, that one is the close.
				const remainingAfterThis = assistantMessage.slice(currentCharIndex + 1)
				if (!FREE_TEXT_PARAMS.has(currentParamName) || !remainingAfterThis.includes(`</${currentParamName}>`)) {
					currentToolUse.params[currentParamName] = assistantMessage
						.slice(currentParamValueStart, currentCharIndex - 10)
						.trim()
					currentParamName = undefined
				} else {
					continue
				}
			} else {
				continue // Still inside param value, move to next char
			}
		}

		// --- State: Parsing a Tool Use (but not a specific parameter) ---
		if (currentToolUse && !currentParamName) {
			// Ensure we are not inside a parameter already
			// Check if starting a new parameter
			let startedNewParam = false
			for (const [tag, paramName] of toolParamOpenTags.entries()) {
				if (currentCharIndex >= tag.length - 1 && assistantMessage.startsWith(tag, currentCharIndex - tag.length + 1)) {
					currentParamName = paramName
					currentParamValueStart = currentCharIndex + 1 // Value starts after the tag
					startedNewParam = true
					break
				}
			}
			if (startedNewParam) {
				continue // Handled start of param, move to next char
			}

			// Check if closing the current tool use — either by its own name, or by another tool's
			// closing tag when that is the only close the model sent (see mismatchedToolCloseTagAt).
			const ownCloseTag = `</${currentToolUse.name}>`
			const toolCloseTag =
				currentCharIndex >= ownCloseTag.length - 1 &&
				assistantMessage.startsWith(ownCloseTag, currentCharIndex - ownCloseTag.length + 1)
					? ownCloseTag
					: mismatchedToolCloseTagAt(assistantMessage, currentCharIndex, currentToolUse.name)
			if (toolCloseTag) {
				// End of the tool use found
				// Special handling for content params *before* finalizing the tool
				const toolContentSlice = assistantMessage.slice(
					currentToolUseStart, // From after the tool opening tag
					currentCharIndex - toolCloseTag.length + 1, // To before the tool closing tag
				)

				// Check if content parameter needs special handling (write_to_file/new_rule)
				// This check is important if the closing </content> tag was missed by the parameter parsing logic
				// (e.g., if content is empty or parsing logic prioritizes tool close)
				const contentParamName: ToolParamName = "content"
				if (
					currentToolUse.name === "write_to_file" /* || currentToolUse.name === "new_rule" */ &&
					toolContentSlice.includes(`<${contentParamName}>`)
				) {
					const contentStartTag = `<${contentParamName}>`
					const contentEndTag = `</${contentParamName}>`
					const contentStart = toolContentSlice.indexOf(contentStartTag)
					// Use lastIndexOf for robustness against nested tags
					const contentEnd = toolContentSlice.lastIndexOf(contentEndTag)

					if (contentStart !== -1 && contentEnd !== -1 && contentEnd > contentStart) {
						const contentValue = toolContentSlice.slice(contentStart + contentStartTag.length, contentEnd).trim()
						currentToolUse.params[contentParamName] = contentValue
					}
				}

				currentToolUse.partial = false // Mark as complete
				contentBlocks.push(currentToolUse)
				currentToolUse = undefined // Reset state
				currentTextContentStart = currentCharIndex + 1 // Potential text starts after this tag
				continue // Move to next char
			}
			// If not starting a param and not closing the tool, continue accumulating tool content implicitly
			continue
		}

		// --- State: Parsing Text / Looking for Tool Start ---
		if (!currentToolUse) {
			// Check if starting a new tool use
			let startedNewTool = false
			for (const [tag, toolName] of toolUseOpenTags.entries()) {
				if (currentCharIndex >= tag.length - 1 && assistantMessage.startsWith(tag, currentCharIndex - tag.length + 1)) {
					// End current text block if one was active
					if (currentTextContent) {
						currentTextContent.content = assistantMessage
							.slice(
								currentTextContentStart, // From where text started
								currentCharIndex - tag.length + 1, // To before the tool tag starts
							)
							.trim()
						currentTextContent.partial = false // Ended because tool started
						if (currentTextContent.content.length > 0) {
							contentBlocks.push(currentTextContent)
						}
						currentTextContent = undefined
					} else {
						// Check for any text between the last block and this tag
						const potentialText = assistantMessage
							.slice(
								currentTextContentStart, // From where text *might* have started
								currentCharIndex - tag.length + 1, // To before the tool tag starts
							)
							.trim()
						if (potentialText.length > 0) {
							contentBlocks.push({
								type: "text",
								content: potentialText,
								partial: false,
							})
						}
					}

					// Start the new tool use
					currentToolUse = {
						type: "tool_use",
						name: toolName,
						params: {},
						partial: true, // Assume partial until closing tag is found
					}
					currentToolUseStart = currentCharIndex + 1 // Tool content starts after the opening tag
					startedNewTool = true
					break
				}
			}

			if (startedNewTool) {
				continue // Handled start of tool, move to next char
			}

			// If not starting a tool, it must be text content
			if (!currentTextContent) {
				// Start a new text block if we aren't already in one
				currentTextContentStart = currentCharIndex // Text starts at the current character
				// Check if the current char is the start of potential text *immediately* after a tag
				// This needs the previous state - simpler to let slicing handle it later.
				// Resetting start index accurately is key.
				// It should be the index *after* the last processed tag.
				// The logic managing currentTextContentStart after closing tags handles this.

				currentTextContent = {
					type: "text",
					content: "", // Will be determined by slicing at the end or when a tool starts
					partial: true,
				}
			}
			// Continue accumulating text implicitly; content is extracted later.
		}
	} // End of loop

	// --- Finalization after loop ---

	// Finalize any open parameter within an open tool use
	if (currentToolUse && currentParamName) {
		currentToolUse.params[currentParamName] = assistantMessage
			.slice(currentParamValueStart) // From param start to end of string
			.trim()
		// Tool use remains partial
	}

	// Finalize any open tool use (which might contain the finalized partial param)
	if (currentToolUse) {
		// Tool use is partial because the loop finished before its closing tag
		contentBlocks.push(currentToolUse)
	}
	// Finalize any trailing text content
	// Only possible if a tool use wasn't open at the very end
	else if (currentTextContent) {
		currentTextContent.content = assistantMessage
			.slice(currentTextContentStart) // From text start to end of string
			.trim()
		// Text is partial because the loop finished
		if (currentTextContent.content.length > 0) {
			contentBlocks.push(currentTextContent)
		}
	}

	return contentBlocks
}
