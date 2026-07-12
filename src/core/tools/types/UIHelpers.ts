import type { ToolUse } from "@core/assistant-message"
import type { TaskConfig } from "./TaskConfig"

export interface StronglyTypedUIHelpers {
	getConfig(): TaskConfig
	removeClosingTag(block: ToolUse, tag: string, value: string): string
	shouldAutoApproveTool(toolName: string): boolean
	removeLastPartialMessageIfExistsWithType(type: "ask" | "say", askOrSay: string): Promise<void>
	say(type: string, text?: string, images?: string[], files?: string[], partial?: boolean): Promise<void>
	ask(type: string, text?: string, partial?: boolean): Promise<any>
}
