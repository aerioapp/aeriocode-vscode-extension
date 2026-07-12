import {
	AeriocodeMessage as AppAeriocodeMessage,
	AeriocodeAsk as AppAeriocodeAsk,
	AeriocodeSay as AppAeriocodeSay,
} from "@shared/ExtensionMessage"

import {
	AeriocodeMessage as ProtoAeriocodeMessage,
	AeriocodeMessageType,
	AeriocodeAsk,
	AeriocodeSay,
} from "@shared/proto/aeriocode/ui"

// Helper function to convert AeriocodeAsk string to enum
function convertAeriocodeAskToProtoEnum(ask: AppAeriocodeAsk | undefined): AeriocodeAsk | undefined {
	if (!ask) {
		return undefined
	}

	const mapping: Record<AppAeriocodeAsk, AeriocodeAsk> = {
		followup: AeriocodeAsk.FOLLOWUP,
		plan_mode_respond: AeriocodeAsk.PLAN_MODE_RESPOND,
		command: AeriocodeAsk.COMMAND,
		command_output: AeriocodeAsk.COMMAND_OUTPUT,
		completion_result: AeriocodeAsk.COMPLETION_RESULT,
		tool: AeriocodeAsk.TOOL,
		api_req_failed: AeriocodeAsk.API_REQ_FAILED,
		resume_task: AeriocodeAsk.RESUME_TASK,
		resume_completed_task: AeriocodeAsk.RESUME_COMPLETED_TASK,
		mistake_limit_reached: AeriocodeAsk.MISTAKE_LIMIT_REACHED,
		auto_approval_max_req_reached: AeriocodeAsk.AUTO_APPROVAL_MAX_REQ_REACHED,
		browser_action_launch: AeriocodeAsk.BROWSER_ACTION_LAUNCH,
		use_mcp_server: AeriocodeAsk.USE_MCP_SERVER,
		new_task: AeriocodeAsk.NEW_TASK,
		condense: AeriocodeAsk.CONDENSE,
		report_bug: AeriocodeAsk.REPORT_BUG,
		summarize_task: AeriocodeAsk.SUMMARIZE_TASK,
		act_mode_respond: AeriocodeAsk.ACT_MODE_RESPOND,
		use_subagents: AeriocodeAsk.USE_SUBAGENTS,
	}

	const result = mapping[ask]
	if (result === undefined) {
		console.warn(`Unknown AeriocodeAsk value: ${ask}`)
	}
	return result
}

// Helper function to convert AeriocodeAsk enum to string
function convertProtoEnumToAeriocodeAsk(ask: AeriocodeAsk): AppAeriocodeAsk | undefined {
	if (ask === AeriocodeAsk.UNRECOGNIZED) {
		console.warn("Received UNRECOGNIZED AeriocodeAsk enum value")
		return undefined
	}

	const mapping: Record<Exclude<AeriocodeAsk, AeriocodeAsk.UNRECOGNIZED>, AppAeriocodeAsk> = {
		[AeriocodeAsk.FOLLOWUP]: "followup",
		[AeriocodeAsk.PLAN_MODE_RESPOND]: "plan_mode_respond",
		[AeriocodeAsk.COMMAND]: "command",
		[AeriocodeAsk.COMMAND_OUTPUT]: "command_output",
		[AeriocodeAsk.COMPLETION_RESULT]: "completion_result",
		[AeriocodeAsk.TOOL]: "tool",
		[AeriocodeAsk.API_REQ_FAILED]: "api_req_failed",
		[AeriocodeAsk.RESUME_TASK]: "resume_task",
		[AeriocodeAsk.RESUME_COMPLETED_TASK]: "resume_completed_task",
		[AeriocodeAsk.MISTAKE_LIMIT_REACHED]: "mistake_limit_reached",
		[AeriocodeAsk.AUTO_APPROVAL_MAX_REQ_REACHED]: "auto_approval_max_req_reached",
		[AeriocodeAsk.BROWSER_ACTION_LAUNCH]: "browser_action_launch",
		[AeriocodeAsk.USE_MCP_SERVER]: "use_mcp_server",
		[AeriocodeAsk.NEW_TASK]: "new_task",
		[AeriocodeAsk.CONDENSE]: "condense",
		[AeriocodeAsk.REPORT_BUG]: "report_bug",
		[AeriocodeAsk.SUMMARIZE_TASK]: "summarize_task",
		[AeriocodeAsk.ACT_MODE_RESPOND]: "act_mode_respond",
		[AeriocodeAsk.USE_SUBAGENTS]: "use_subagents",
	}

	return mapping[ask]
}

// Helper function to convert AeriocodeSay string to enum
function convertAeriocodeSayToProtoEnum(say: AppAeriocodeSay | undefined): AeriocodeSay | undefined {
	if (!say) {
		return undefined
	}

	const mapping: Record<AppAeriocodeSay, AeriocodeSay> = {
		task: AeriocodeSay.TASK,
		error: AeriocodeSay.ERROR,
		api_req_started: AeriocodeSay.API_REQ_STARTED,
		api_req_finished: AeriocodeSay.API_REQ_FINISHED,
		text: AeriocodeSay.TEXT,
		reasoning: AeriocodeSay.REASONING,
		completion_result: AeriocodeSay.COMPLETION_RESULT_SAY,
		user_feedback: AeriocodeSay.USER_FEEDBACK,
		user_feedback_diff: AeriocodeSay.USER_FEEDBACK_DIFF,
		api_req_retried: AeriocodeSay.API_REQ_RETRIED,
		command: AeriocodeSay.COMMAND_SAY,
		command_output: AeriocodeSay.COMMAND_OUTPUT_SAY,
		tool: AeriocodeSay.TOOL_SAY,
		shell_integration_warning: AeriocodeSay.SHELL_INTEGRATION_WARNING,
		browser_action_launch: AeriocodeSay.BROWSER_ACTION_LAUNCH_SAY,
		browser_action: AeriocodeSay.BROWSER_ACTION,
		browser_action_result: AeriocodeSay.BROWSER_ACTION_RESULT,
		mcp_server_request_started: AeriocodeSay.MCP_SERVER_REQUEST_STARTED,
		mcp_server_response: AeriocodeSay.MCP_SERVER_RESPONSE,
		mcp_notification: AeriocodeSay.MCP_NOTIFICATION,
		use_mcp_server: AeriocodeSay.USE_MCP_SERVER_SAY,
		diff_error: AeriocodeSay.DIFF_ERROR,
		deleted_api_reqs: AeriocodeSay.DELETED_API_REQS,
		aeriocodeignore_error: AeriocodeSay.AERIOCODEIGNORE_ERROR,
		checkpoint_created: AeriocodeSay.CHECKPOINT_CREATED,
		load_mcp_documentation: AeriocodeSay.LOAD_MCP_DOCUMENTATION,
		info: AeriocodeSay.INFO,
		task_progress: AeriocodeSay.TASK_PROGRESS,
		error_retry: AeriocodeSay.ERROR_RETRY,
		generate_explanation: AeriocodeSay.GENERATE_EXPLANATION,
		hook_status: AeriocodeSay.HOOK_STATUS,
		hook_output_stream: AeriocodeSay.HOOK_OUTPUT_STREAM,
		command_permission_denied: AeriocodeSay.COMMAND_PERMISSION_DENIED,
		conditional_rules_applied: AeriocodeSay.CONDITIONAL_RULES_APPLIED,
		subagent_status: AeriocodeSay.SUBAGENT_STATUS,
		use_subagents: AeriocodeSay.USE_SUBAGENTS_SAY,
		subagent_usage: AeriocodeSay.SUBAGENT_USAGE,
	}

	const result = mapping[say]
	if (result === undefined) {
		console.warn(`Unknown AeriocodeSay value: ${say}`)
	}
	return result
}

// Helper function to convert AeriocodeSay enum to string
function convertProtoEnumToAeriocodeSay(say: AeriocodeSay): AppAeriocodeSay | undefined {
	if (say === AeriocodeSay.UNRECOGNIZED) {
		console.warn("Received UNRECOGNIZED AeriocodeSay enum value")
		return undefined
	}

	const mapping: Record<Exclude<AeriocodeSay, AeriocodeSay.UNRECOGNIZED>, AppAeriocodeSay> = {
		[AeriocodeSay.TASK]: "task",
		[AeriocodeSay.ERROR]: "error",
		[AeriocodeSay.API_REQ_STARTED]: "api_req_started",
		[AeriocodeSay.API_REQ_FINISHED]: "api_req_finished",
		[AeriocodeSay.TEXT]: "text",
		[AeriocodeSay.REASONING]: "reasoning",
		[AeriocodeSay.COMPLETION_RESULT_SAY]: "completion_result",
		[AeriocodeSay.USER_FEEDBACK]: "user_feedback",
		[AeriocodeSay.USER_FEEDBACK_DIFF]: "user_feedback_diff",
		[AeriocodeSay.API_REQ_RETRIED]: "api_req_retried",
		[AeriocodeSay.COMMAND_SAY]: "command",
		[AeriocodeSay.COMMAND_OUTPUT_SAY]: "command_output",
		[AeriocodeSay.TOOL_SAY]: "tool",
		[AeriocodeSay.SHELL_INTEGRATION_WARNING]: "shell_integration_warning",
		[AeriocodeSay.BROWSER_ACTION_LAUNCH_SAY]: "browser_action_launch",
		[AeriocodeSay.BROWSER_ACTION]: "browser_action",
		[AeriocodeSay.BROWSER_ACTION_RESULT]: "browser_action_result",
		[AeriocodeSay.MCP_SERVER_REQUEST_STARTED]: "mcp_server_request_started",
		[AeriocodeSay.MCP_SERVER_RESPONSE]: "mcp_server_response",
		[AeriocodeSay.MCP_NOTIFICATION]: "mcp_notification",
		[AeriocodeSay.USE_MCP_SERVER_SAY]: "use_mcp_server",
		[AeriocodeSay.DIFF_ERROR]: "diff_error",
		[AeriocodeSay.DELETED_API_REQS]: "deleted_api_reqs",
		[AeriocodeSay.AERIOCODEIGNORE_ERROR]: "aeriocodeignore_error",
		[AeriocodeSay.CHECKPOINT_CREATED]: "checkpoint_created",
		[AeriocodeSay.LOAD_MCP_DOCUMENTATION]: "load_mcp_documentation",
		[AeriocodeSay.INFO]: "info",
		[AeriocodeSay.TASK_PROGRESS]: "task_progress",
		[AeriocodeSay.ERROR_RETRY]: "error_retry",
		[AeriocodeSay.GENERATE_EXPLANATION]: "generate_explanation",
		[AeriocodeSay.HOOK_STATUS]: "hook_status",
		[AeriocodeSay.HOOK_OUTPUT_STREAM]: "hook_output_stream",
		[AeriocodeSay.COMMAND_PERMISSION_DENIED]: "command_permission_denied",
		[AeriocodeSay.CONDITIONAL_RULES_APPLIED]: "conditional_rules_applied",
		[AeriocodeSay.SUBAGENT_STATUS]: "subagent_status",
		[AeriocodeSay.USE_SUBAGENTS_SAY]: "use_subagents",
		[AeriocodeSay.SUBAGENT_USAGE]: "subagent_usage",
	}

	return mapping[say]
}

/**
 * Convert application AeriocodeMessage to proto AeriocodeMessage
 */
export function convertAeriocodeMessageToProto(message: AppAeriocodeMessage): ProtoAeriocodeMessage {
	// For sending messages, we need to provide values for required proto fields
	const askEnum = message.ask ? convertAeriocodeAskToProtoEnum(message.ask) : undefined
	const sayEnum = message.say ? convertAeriocodeSayToProtoEnum(message.say) : undefined

	// Determine appropriate enum values based on message type
	let finalAskEnum: AeriocodeAsk = AeriocodeAsk.FOLLOWUP // Proto default
	let finalSayEnum: AeriocodeSay = AeriocodeSay.TEXT // Proto default

	if (message.type === "ask") {
		finalAskEnum = askEnum ?? AeriocodeAsk.FOLLOWUP // Use FOLLOWUP as default for ask messages
	} else if (message.type === "say") {
		finalSayEnum = sayEnum ?? AeriocodeSay.TEXT // Use TEXT as default for say messages
	}

	const protoMessage: ProtoAeriocodeMessage = {
		ts: message.ts,
		type: message.type === "ask" ? AeriocodeMessageType.ASK : AeriocodeMessageType.SAY,
		ask: finalAskEnum,
		say: finalSayEnum,
		text: message.text ?? "",
		reasoning: message.reasoning ?? "",
		images: message.images ?? [],
		files: message.files ?? [],
		partial: message.partial ?? false,
		lastCheckpointHash: message.lastCheckpointHash ?? "",
		isCheckpointCheckedOut: message.isCheckpointCheckedOut ?? false,
		isOperationOutsideWorkspace: message.isOperationOutsideWorkspace ?? false,
		conversationHistoryIndex: message.conversationHistoryIndex ?? 0,
		conversationHistoryDeletedRange: message.conversationHistoryDeletedRange
			? {
					startIndex: message.conversationHistoryDeletedRange[0],
					endIndex: message.conversationHistoryDeletedRange[1],
				}
			: undefined,
	}

	return protoMessage
}

/**
 * Convert proto AeriocodeMessage to application AeriocodeMessage
 */
export function convertProtoToAeriocodeMessage(protoMessage: ProtoAeriocodeMessage): AppAeriocodeMessage {
	const message: AppAeriocodeMessage = {
		ts: protoMessage.ts,
		type: protoMessage.type === AeriocodeMessageType.ASK ? "ask" : "say",
	}

	// Convert ask enum to string
	if (protoMessage.type === AeriocodeMessageType.ASK) {
		const ask = convertProtoEnumToAeriocodeAsk(protoMessage.ask)
		if (ask !== undefined) {
			message.ask = ask
		}
	}

	// Convert say enum to string
	if (protoMessage.type === AeriocodeMessageType.SAY) {
		const say = convertProtoEnumToAeriocodeSay(protoMessage.say)
		if (say !== undefined) {
			message.say = say
		}
	}

	// Convert other fields - preserve empty strings as they may be intentional
	if (protoMessage.text !== "") {
		message.text = protoMessage.text
	}
	if (protoMessage.reasoning !== "") {
		message.reasoning = protoMessage.reasoning
	}
	if (protoMessage.images.length > 0) {
		message.images = protoMessage.images
	}
	if (protoMessage.files.length > 0) {
		message.files = protoMessage.files
	}
	if (protoMessage.partial) {
		message.partial = protoMessage.partial
	}
	if (protoMessage.lastCheckpointHash !== "") {
		message.lastCheckpointHash = protoMessage.lastCheckpointHash
	}
	if (protoMessage.isCheckpointCheckedOut) {
		message.isCheckpointCheckedOut = protoMessage.isCheckpointCheckedOut
	}
	if (protoMessage.isOperationOutsideWorkspace) {
		message.isOperationOutsideWorkspace = protoMessage.isOperationOutsideWorkspace
	}
	if (protoMessage.conversationHistoryIndex !== 0) {
		message.conversationHistoryIndex = protoMessage.conversationHistoryIndex
	}

	// Convert conversationHistoryDeletedRange from object to tuple
	if (protoMessage.conversationHistoryDeletedRange) {
		message.conversationHistoryDeletedRange = [
			protoMessage.conversationHistoryDeletedRange.startIndex,
			protoMessage.conversationHistoryDeletedRange.endIndex,
		]
	}

	return message
}
