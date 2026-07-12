import type { ToolUse } from "@core/assistant-message"
import type { TaskConfig } from "../types/TaskConfig"
import type { Anthropic } from "@anthropic-ai/sdk"

/**
 * Utility class for tool result operations in AerioCode.
 */
export class ToolResultUtils {
	/**
	 * Asks for approval and pushes feedback to user message content.
	 */
	static async askApprovalAndPushFeedback(askType: string, message: string, config: TaskConfig): Promise<boolean> {
		const { response, text, images, files } = await config.callbacks.ask(askType as any, message, false)

		if (text || images?.length || files?.length) {
			const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []
			if (text) {
				content.push({ type: "text", text: `\n\n[User Feedback]: ${text}` } as Anthropic.TextBlockParam)
			}
			if (images?.length) {
				for (const image of images) {
					content.push({
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: image.replace(/^data:image\/png;base64,/, ""),
						},
					} as Anthropic.ImageBlockParam)
				}
			}
			config.taskState.userMessageContent.push(...content)
		}

		return response === "yesButtonClicked"
	}

	/**
	 * Pushes additional tool feedback to user message content.
	 */
	static pushAdditionalToolFeedback(
		userMessageContent: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>,
		text?: string,
		images?: string[],
		fileContent?: string,
	): void {
		if (text) {
			userMessageContent.push({
				type: "text",
				text: `\n\n[User Feedback]: ${text}`,
			} as Anthropic.TextBlockParam)
		}
		if (images?.length) {
			for (const image of images) {
				userMessageContent.push({
					type: "image",
					source: {
						type: "base64",
						media_type: "image/png",
						data: image.replace(/^data:image\/png;base64,/, ""),
					},
				} as Anthropic.ImageBlockParam)
			}
		}
		if (fileContent) {
			userMessageContent.push({
				type: "text",
				text: `\n\n[File Content]: ${fileContent}`,
			} as Anthropic.TextBlockParam)
		}
	}
}
