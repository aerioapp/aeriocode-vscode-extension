// type that represents json data that is sent from extension to webview, called ExtensionMessage and has 'type' enum which can be 'plusButtonClicked' or 'settingsButtonClicked' or 'hello'
import { ApiConfiguration } from "./api"
import { AutoApprovalSettings } from "./AutoApprovalSettings"
import { BrowserSettings } from "./BrowserSettings"
import { Mode, OpenaiReasoningEffort } from "./storage/types"
import { HistoryItem } from "./HistoryItem"
import { TelemetrySetting } from "./TelemetrySetting"
import { AeriocodeRulesToggles } from "./aeriocode-rules"
import { UserInfo } from "./UserInfo"
import { McpDisplayMode } from "./McpDisplayMode"

// webview will hold state
export interface ExtensionMessage {
	type: "grpc_response" // New type for gRPC responses
	grpc_response?: GrpcResponse
}

export type GrpcResponse = {
	message?: any // JSON serialized protobuf message
	request_id: string // Same ID as the request
	error?: string // Optional error message
	is_streaming?: boolean // Whether this is part of a streaming response
	sequence_number?: number // For ordering chunks in streaming responses
}

export type Platform = "aix" | "darwin" | "freebsd" | "linux" | "openbsd" | "sunos" | "win32" | "unknown"

export const DEFAULT_PLATFORM = "unknown"

export interface ExtensionState {
	isNewUser: boolean
	welcomeViewCompleted: boolean
	apiConfiguration?: ApiConfiguration
	autoApprovalSettings: AutoApprovalSettings
	browserSettings: BrowserSettings
	remoteBrowserHost?: string
	preferredLanguage?: string
	openaiReasoningEffort?: OpenaiReasoningEffort
	mode: Mode
	checkpointTrackerErrorMessage?: string
	aeriocodeMessages: AeriocodeMessage[]
	currentTaskItem?: HistoryItem
	mcpMarketplaceEnabled?: boolean
	mcpDisplayMode: McpDisplayMode
	planActSeparateModelsSetting: boolean
	enableCheckpointsSetting?: boolean
	platform: Platform
	shouldShowAnnouncement: boolean
	taskHistory: HistoryItem[]
	telemetrySetting: TelemetrySetting
	shellIntegrationTimeout: number
	terminalReuseEnabled?: boolean
	terminalOutputLineLimit: number
	defaultTerminalProfile?: string
	uriScheme?: string
	userInfo?: UserInfo
	version: string
	distinctId: string
	globalAeriocodeRulesToggles: AeriocodeRulesToggles
	localAeriocodeRulesToggles: AeriocodeRulesToggles
	localWorkflowToggles: AeriocodeRulesToggles
	globalWorkflowToggles: AeriocodeRulesToggles
	localCursorRulesToggles: AeriocodeRulesToggles
	localWindsurfRulesToggles: AeriocodeRulesToggles
	mcpResponsesCollapsed?: boolean
	strictPlanModeEnabled?: boolean
	certificationActive?: boolean
	certificationProfile?: string
	certificationLevel?: string
}

export interface AeriocodeMessage {
	ts: number
	type: "ask" | "say"
	ask?: AeriocodeAsk
	say?: AeriocodeSay
	text?: string
	reasoning?: string
	images?: string[]
	files?: string[]
	partial?: boolean
	lastCheckpointHash?: string
	isCheckpointCheckedOut?: boolean
	isOperationOutsideWorkspace?: boolean
	conversationHistoryIndex?: number
	conversationHistoryDeletedRange?: [number, number] // for when conversation history is truncated for API requests
}

export type AeriocodeAsk =
	| "followup"
	| "plan_mode_respond"
	| "command"
	| "command_output"
	| "completion_result"
	| "tool"
	| "api_req_failed"
	| "resume_task"
	| "resume_completed_task"
	| "mistake_limit_reached"
	| "auto_approval_max_req_reached"
	| "browser_action_launch"
	| "use_mcp_server"
	| "new_task"
	| "condense"
	| "report_bug"
	| "summarize_task"
	| "act_mode_respond"
	| "use_subagents"

export type AeriocodeSay =
	| "task"
	| "error"
	| "api_req_started"
	| "api_req_finished"
	| "text"
	| "reasoning"
	| "completion_result"
	| "user_feedback"
	| "user_feedback_diff"
	| "api_req_retried"
	| "command"
	| "command_output"
	| "tool"
	| "shell_integration_warning"
	| "browser_action_launch"
	| "browser_action"
	| "browser_action_result"
	| "mcp_server_request_started"
	| "mcp_server_response"
	| "mcp_notification"
	| "use_mcp_server"
	| "diff_error"
	| "deleted_api_reqs"
	| "aeriocodeignore_error"
	| "checkpoint_created"
	| "load_mcp_documentation"
	| "info"
	| "task_progress"
	| "error_retry"
	| "generate_explanation"
	| "hook_status"
	| "hook_output_stream"
	| "command_permission_denied"
	| "conditional_rules_applied"
	| "subagent_status"
	| "use_subagents"
	| "subagent_usage"

export interface AeriocodeSayTool {
	tool:
		| "editedExistingFile"
		| "newFileCreated"
		| "fileDeleted"
		| "readFile"
		| "listFilesTopLevel"
		| "listFilesRecursive"
		| "listCodeDefinitionNames"
		| "searchFiles"
		| "webFetch"
	path?: string
	diff?: string
	content?: string
	regex?: string
	filePattern?: string
	operationIsLocatedInWorkspace?: boolean
	startLineNumbers?: number[]
}

// must keep in sync with system prompt
export const browserActions = ["launch", "click", "type", "scroll_down", "scroll_up", "close"] as const
export type BrowserAction = (typeof browserActions)[number]

export interface AeriocodeSayBrowserAction {
	action: BrowserAction
	coordinate?: string
	text?: string
}

export type BrowserActionResult = {
	screenshot?: string
	logs?: string
	currentUrl?: string
	currentMousePosition?: string
}

export interface AeriocodeAskUseMcpServer {
	serverName: string
	type: "use_mcp_tool" | "access_mcp_resource"
	toolName?: string
	arguments?: string
	uri?: string
}

export interface AeriocodePlanModeResponse {
	response: string
	options?: string[]
	selected?: string
}

export interface AeriocodeAskQuestion {
	question: string
	options?: string[]
	selected?: string
}

export interface AeriocodeAskNewTask {
	context: string
}

export interface AeriocodeApiReqInfo {
	request?: string
	tokensIn?: number
	tokensOut?: number
	cacheWrites?: number
	cacheReads?: number
	cost?: number
	cancelReason?: AeriocodeApiReqCancelReason
	streamingFailedMessage?: string
	retryStatus?: {
		attempt: number
		maxAttempts: number
		delaySec: number
		errorSnippet?: string
	}
}

export type AeriocodeApiReqCancelReason = "streaming_failed" | "user_cancelled" | "retries_exhausted"

export const COMPLETION_RESULT_CHANGES_FLAG = "HAS_CHANGES"

export interface AeriocodeSayGenerateExplanation {
	title: string
	fromRef: string
	toRef: string
	status: "generating" | "complete" | "error"
	error?: string
}
