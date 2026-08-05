export type ApiStream = AsyncGenerator<ApiStreamChunk>
export type ApiStreamChunk = ApiStreamTextChunk | ApiStreamReasoningChunk | ApiStreamUsageChunk | ApiStreamTruncatedChunk

/**
 * The generation was cut off by the output token limit rather than finishing.
 *
 * Worth a chunk type of its own because the consequence is silent and specific: at the end of a
 * stream every partial content block is marked complete, so a `write_to_file` whose `<content>`
 * was cut off mid-file is executed and a truncated source file is saved looking whole. In a tool
 * whose purpose is that generated code is verifiable, that is the worst available failure — the
 * file analyses, reports findings, and is not the file the model was writing.
 */
export interface ApiStreamTruncatedChunk {
	type: "truncated"
	/** The provider's own reason, kept for the message shown to the user. */
	reason: string
}

/**
 * The truncation chunk for an OpenAI-shaped streaming choice, or null if it did not truncate.
 *
 * Lives here rather than inline in the provider so it can be tested: the provider imports the
 * account service, which reaches `vscode`, so nothing in that module is loadable from the unit
 * runner. A one-line condition guarding a silent data-loss path is exactly the kind that should
 * not be untestable.
 *
 * Only `length` counts. `content_filter` and `error` are also non-`stop` endings, but they mean the
 * answer was refused or failed rather than cut off part-way, and telling the model to "write less
 * next time" would be wrong advice for both.
 */
export function truncationChunkFor(choice: { finish_reason?: string | null } | undefined | null): ApiStreamTruncatedChunk | null {
	return choice?.finish_reason === "length" ? { type: "truncated", reason: "length" } : null
}

export interface ApiStreamTextChunk {
	type: "text"
	text: string
}

export interface ApiStreamReasoningChunk {
	type: "reasoning"
	reasoning: string
}

export interface ApiStreamUsageChunk {
	type: "usage"
	inputTokens: number
	outputTokens: number
	cacheWriteTokens?: number
	cacheReadTokens?: number
	thoughtsTokenCount?: number // openrouter
	totalCost?: number // openrouter
}
