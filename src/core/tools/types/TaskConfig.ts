import type { ApiHandler } from "@api/index"
import type { FileContextTracker } from "@core/context/context-tracking/FileContextTracker"
import type { AeriocodeIgnoreController } from "@core/ignore/AeriocodeIgnoreController"
import { DiffViewProvider } from "@integrations/editor/DiffViewProvider"
import type { McpHub } from "@services/mcp/McpHub"
import { AutoApprovalSettings } from "@shared/AutoApprovalSettings"
import { BrowserSettings } from "@shared/BrowserSettings"
import { AeriocodeAsk, AeriocodeSay } from "@shared/ExtensionMessage"
import { AeriocodeAskResponse } from "@shared/WebviewMessage"
import type { MessageStateHandler } from "../../task/message-state"
import type { TaskState } from "../../task/TaskState"

export interface TaskStateService {
	getGlobalSettingsKey(key: string): any
	getApiConfiguration(): any
}

export interface TaskServices {
	stateManager: TaskStateService
	diffViewProvider: DiffViewProvider
	mcpHub: McpHub
	fileContextTracker: FileContextTracker
}

export interface TaskCallbacks {
	say(type: AeriocodeSay, text?: string, images?: string[], files?: string[], partial?: boolean): Promise<void>
	ask(
		type: AeriocodeAsk,
		text?: string,
		partial?: boolean,
	): Promise<{ response: AeriocodeAskResponse; text?: string; images?: string[]; files?: string[] }>
	removeLastPartialMessageIfExistsWithType(type: "ask" | "say", askOrSay: string): Promise<void>
	sayAndCreateMissingParamError(toolName: string, paramName: string): Promise<string>
	shouldAutoApproveTool(toolName: string): boolean
	shouldAutoApproveToolWithPath(toolName: string, path: string | undefined): Promise<boolean>
}

export interface TaskConfig {
	readonly taskId: string
	readonly ulid: string
	readonly cwd: string
	services: TaskServices
	callbacks: TaskCallbacks
	taskState: TaskState
	autoApprovalSettings: AutoApprovalSettings
	browserSettings: BrowserSettings
	api: ApiHandler
	messageState: MessageStateHandler
}
