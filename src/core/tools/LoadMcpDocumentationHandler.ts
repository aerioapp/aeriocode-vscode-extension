import type { ToolUse } from "@core/assistant-message"
import { loadMcpDocumentation } from "@core/prompts/loadMcpDocumentation"
import type { ToolResponse } from "../task/index"
import type { IPartialBlockHandler, IToolHandler } from "./ToolExecutorCoordinator"
import type { TaskConfig } from "./types/TaskConfig"
import type { StronglyTypedUIHelpers } from "./types/UIHelpers"

export class LoadMcpDocumentationHandler implements IToolHandler, IPartialBlockHandler {
	readonly name = "mcp_docs"

	constructor() {}

	getDescription(block: ToolUse): string {
		return `[${block.name}]`
	}

	async handlePartialBlock(_block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		await uiHelpers.say("load_mcp_documentation", "", undefined, undefined, true)
	}

	async execute(config: TaskConfig, _block: ToolUse): Promise<ToolResponse> {
		await config.callbacks.say("load_mcp_documentation", "", undefined, undefined, false)

		config.taskState.consecutiveMistakeCount = 0

		try {
			const documentation = await loadMcpDocumentation(config.services.mcpHub)
			return documentation
		} catch (error) {
			return `Error loading MCP documentation: ${(error as Error)?.message}`
		}
	}
}
