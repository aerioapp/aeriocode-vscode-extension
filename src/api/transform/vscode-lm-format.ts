import { Anthropic } from "@anthropic-ai/sdk"

/**
 * This file is no longer used since we only support Aeriocode provider.
 * VSCode Language Model API functionality has been removed.
 */
export function convertToVsCodeLmMessages(): any[] {
	// Return empty array since VSCode LM API is not supported
	return []
}

export function convertToAnthropicRole(): string | null {
	// Return null since VSCode LM API is not supported
	return null
}

export function convertToAnthropicMessage(): Anthropic.Messages.Message {
	// Return empty message since VSCode LM API is not supported
	return {
		id: crypto.randomUUID(),
		type: "message",
		model: "vscode-lm",
		role: "assistant",
		content: [],
		stop_reason: null,
		stop_sequence: null,
		usage: {
			input_tokens: 0,
			output_tokens: 0,
			cache_creation_input_tokens: null,
			cache_read_input_tokens: null,
			server_tool_use: null,
		},
	}
}
