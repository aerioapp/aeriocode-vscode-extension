import { Anthropic } from "@anthropic-ai/sdk"
import { AssistantMessageContent } from "@core/assistant-message"
import { StreamingJsonReplacer } from "@core/assistant-message/diff-json"
import { AeriocodeAskResponse } from "@shared/WebviewMessage"

export class TaskState {
	// Streaming flags
	isStreaming = false
	isWaitingForFirstChunk = false
	didCompleteReadingStream = false
	/**
	 * The last stream ended because the model hit its output token limit.
	 *
	 * Kept because end-of-stream marks every partial content block complete, which for a truncated
	 * `write_to_file` means executing it and saving a source file that stops mid-function. Reset per
	 * request alongside the other streaming flags.
	 */
	didTruncateResponse = false
	/**
	 * A tool call was discarded because its closing tag never arrived.
	 *
	 * Distinct from {@link didTruncateResponse}: a provider can report a clean stop and still leave
	 * the call unterminated, so the missing tag is the evidence and the reported reason is not.
	 */
	didDropIncompleteToolUse = false

	// Content processing
	currentStreamingContentIndex = 0
	assistantMessageContent: AssistantMessageContent[] = []
	userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
	userMessageContentReady = false

	// Presentation locks
	presentAssistantMessageLocked = false
	presentAssistantMessageHasPendingUpdates = false

	// Claude 4 experimental JSON streaming
	streamingJsonReplacer?: StreamingJsonReplacer
	lastProcessedJsonLength: number = 0

	// Ask/Response handling
	askResponse?: AeriocodeAskResponse
	askResponseText?: string
	askResponseImages?: string[]
	askResponseFiles?: string[]
	lastMessageTs?: number

	// Plan mode specific state
	isAwaitingPlanResponse = false
	didRespondToPlanAskBySwitchingMode = false

	// Context and history
	conversationHistoryDeletedRange?: [number, number]

	// Tool execution flags
	didRejectTool = false
	didAlreadyUseTool = false
	didEditFile: boolean = false

	// Consecutive request tracking
	consecutiveAutoApprovedRequestsCount: number = 0

	// Error tracking
	consecutiveMistakeCount: number = 0
	didAutomaticallyRetryFailedApiRequest = false
	checkpointTrackerErrorMessage?: string

	// Task Initialization
	isInitialized = false

	// Task Abort / Cancellation
	abort: boolean = false
	didFinishAbortingStream = false
	abandoned = false

	// File read cache for tracking file reads
	fileReadCache = new Map<string, string>()

	// Files written during current AI generation (for certification audit trail)
	filesWrittenDuringGeneration: string[] = []
}
