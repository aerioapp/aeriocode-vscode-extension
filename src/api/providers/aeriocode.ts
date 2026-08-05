import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from "../"
import { AeriocodeAccountService } from "@/services/account/AeriocodeAccountService"
import { ModelInfo, backendDefaultModelId, backendDefaultModelInfo } from "@shared/api"
import { createOpenRouterStream } from "../transform/openrouter-stream"
import { ApiStream, ApiStreamUsageChunk, truncationChunkFor } from "../transform/stream"
import axios from "axios"
import { OpenRouterErrorResponse } from "./types"
import { withRetry } from "../retry"
import { AuthService } from "@/services/auth/AuthService"
import OpenAI from "openai"
import { version as extensionVersion } from "../../../package.json"
import { shouldSkipReasoningForModel } from "@utils/model-utils"
import { AERIOCODE_ACCOUNT_AUTH_ERROR_MESSAGE } from "@/shared/AeriocodeAccount"
import { aeriocodeEnvConfig } from "@/config"

interface AeriocodeHandlerOptions {
	taskId?: string
	reasoningEffort?: string
	thinkingBudgetTokens?: number
	aeriocodeAccountId?: string
	modelId?: string
	context?: {
		cwd?: string
		osName?: string
		shell?: string
		homeDir?: string
		browserWidth?: number
		browserHeight?: number
		mcpServers?: any[]
		browserSettings?: any
		/** See ApiHandlerOptions in @shared/api — the standard in force, if any. */
		complianceProfile?: {
			standard: string
			level?: string | null
			regime?: string
			language?: string
		}
	}
	userInstructions?: string
}

export class AeriocodeHandler implements ApiHandler {
	private options: AeriocodeHandlerOptions
	private aeriocodeAccountService = AeriocodeAccountService.getInstance()
	private _authService: AuthService
	private client: OpenAI | undefined
	private readonly _baseUrl = aeriocodeEnvConfig.apiBaseUrl
	lastGenerationId?: string
	private counter = 0
	private availableModels: ModelInfo[] = []
	private availableModelIds: string[] = []
	private currentModelId: string

	constructor(options: AeriocodeHandlerOptions) {
		this.options = options
		this._authService = AuthService.getInstance()
		// Set initial model ID - prioritize the provided modelId, otherwise use default
		this.currentModelId = options.modelId || backendDefaultModelId
		// Fetch available models on initialization
		this.fetchAvailableModels()
	}

	private async ensureClient(): Promise<OpenAI> {
		const aeriocodeAccountAuthToken = await this._authService.getAuthToken()
		if (!aeriocodeAccountAuthToken) {
			throw new Error(AERIOCODE_ACCOUNT_AUTH_ERROR_MESSAGE)
		}
		if (!this.client) {
			try {
				this.client = new OpenAI({
					baseURL: `${this._baseUrl}/api/v1`,
					apiKey: aeriocodeAccountAuthToken,
					defaultHeaders: {
						"HTTP-Referer": "https://aeriocode.bot",
						"X-Title": "Aeriocode",
						"X-Task-ID": this.options.taskId || "",
						"X-Aeriocode-Version": extensionVersion,
					},
				})
			} catch (error: any) {
				throw new Error(`Error creating Aeriocode client: ${error.message}`)
			}
		}
		// Ensure the client is always using the latest auth token
		this.client.apiKey = aeriocodeAccountAuthToken
		return this.client
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		try {
			const client = await this.ensureClient()

			this.lastGenerationId = undefined

			let didOutputUsage: boolean = false
			let inputTokens = 0
			let outputTokens = 0

			// Convert Anthropic messages to OpenAI format
			// DO NOT send system prompt - backend will generate it dynamically
			const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				// { role: "system", content: systemPrompt }, // REMOVED - backend handles this
				...messages.map((msg) => ({
					role: msg.role as "user" | "assistant" | "system",
					content:
						typeof msg.content === "string"
							? msg.content
							: msg.content
									.map((block) => {
										if (block.type === "text") {
											return block.text
										}
										return ""
									})
									.join(""),
				})),
			]

			// Calculate approximate input tokens for usage tracking
			// Note: system prompt tokens are now handled by backend
			const messagesTokens = messages.reduce((total, msg) => {
				const content =
					typeof msg.content === "string"
						? msg.content
						: msg.content
								.map((block) => {
									if (block.type === "text") {
										return block.text
									}
									return ""
								})
								.join("")
				return total + Math.ceil(content.length / 4)
			}, 0)
			inputTokens = messagesTokens // No system prompt tokens since backend handles it

			// Use axios to make direct API call to backend with context and user instructions
			const aeriocodeAccountAuthToken = await this._authService.getAuthToken()
			if (!aeriocodeAccountAuthToken) {
				throw new Error(AERIOCODE_ACCOUNT_AUTH_ERROR_MESSAGE)
			}

			const response = await axios.post(
				`${this._baseUrl}/api/v1/chat/completions`,
				{
					model: this.getModel().id,
					messages: openAiMessages,
					temperature: 0.7,
					max_tokens: 32000,
					stream: true,
					// Pass context information and user instructions to backend for system prompt generation
					...(this.options.context && {
						context: this.options.context,
					}),
					...(this.options.userInstructions && {
						userInstructions: this.options.userInstructions,
					}),
				},
				{
					headers: {
						Authorization: `Bearer ${aeriocodeAccountAuthToken}`,
						"X-Session-ID": aeriocodeAccountAuthToken, // Pass session ID as header for aeriocode backend
						"HTTP-Referer": "https://aeriocode.bot",
						"X-Title": "Aeriocode",
						"X-Task-ID": this.options.taskId || "",
						"X-Aeriocode-Version": extensionVersion,
						"Content-Type": "application/json",
					},
					responseType: "stream",
					withCredentials: true, // Include cookies in the request for session-based auth
				},
			)

			// Process the streaming response
			const stream = response.data
			for await (const chunk of stream) {
				// Parse SSE data - preserve empty lines to correctly separate events
				const lines = chunk.toString().split("\n")

				for (const line of lines) {
					const trimmedLine = line.trim()
					if (!trimmedLine) {
						continue
					}
					if (trimmedLine.startsWith("data: ")) {
						const data = trimmedLine.slice(6)

						if (data === "[DONE]") {
							// Stream completed - exit the generator entirely
							return
						}

						try {
							const parsed = JSON.parse(data)

							// An error event, not a completion chunk. The backend emits one of these when
							// the upstream refuses mid-stream — most often an exhausted daily quota.
							//
							// ⚠️ It used to fall through to `parsed.choices?.[0]`, find nothing, and yield
							// nothing at all. With no text in the whole stream the turn ended with an empty
							// assistant message and the task loop reported "the language model did not
							// provide any assistant messages. This may indicate an issue with the API or
							// the model's output" — telling a user who is simply out of requests that the
							// model is broken, with no remedy in the message and nothing in the logs
							// pointing at the real cause.
							//
							// Thrown rather than yielded so it travels the path errors already travel: the
							// retry wrapper can see it, and the UI shows it as a failure instead of a
							// silent empty turn.
							if (parsed.error) {
								const message =
									typeof parsed.error === "string" ? parsed.error : parsed.error.message || "Upstream error"
								const failure = new Error(message) as Error & { status?: number; isUpstreamFailure?: boolean }
								// Tagged so the catch below can tell it from a malformed chunk, which that
								// catch is there to ignore.
								failure.isUpstreamFailure = true
								if (typeof parsed.error === "object" && parsed.error.status) {
									failure.status = parsed.error.status
								}
								throw failure
							}

							const choice = parsed.choices?.[0]
							const delta = choice?.delta

							// "length" means the model ran out of output budget mid-answer. Announced
							// before the content of this chunk is yielded so the task loop knows the
							// stream is incomplete by the time it finalises the parsed blocks.
							const truncated = truncationChunkFor(choice)
							if (truncated) {
								yield truncated
							}

							if (delta?.content) {
								// Count output tokens approximately
								outputTokens += Math.ceil((delta.content.length || 0) / 4)

								yield {
									type: "text",
									text: delta.content,
								}
							}

							// Handle usage information if available
							if (parsed.usage && !didOutputUsage) {
								yield {
									type: "usage",
									cacheWriteTokens: 0,
									cacheReadTokens: 0,
									inputTokens: parsed.usage.prompt_tokens || inputTokens,
									outputTokens: parsed.usage.completion_tokens || outputTokens,
									totalCost: 0, // No cost tracking for local setup
								}
								didOutputUsage = true
							}
						} catch (error) {
							// ⚠️ This catch exists to tolerate a malformed chunk, and it will happily
							// swallow a deliberate throw from the block above with it. The upstream
							// failure raised for an error event has to get past here, or reporting it is
							// exactly as silent as not reporting it was.
							if (error instanceof Error && (error as Error & { isUpstreamFailure?: boolean }).isUpstreamFailure) {
								throw error
							}
							// Ignore parsing errors for malformed chunks
							console.warn("Failed to parse streaming chunk:", data)
						}
					}
				}
			}

			// Always output usage information if not already done
			if (!didOutputUsage) {
				yield {
					type: "usage",
					cacheWriteTokens: 0,
					cacheReadTokens: 0,
					inputTokens: inputTokens,
					outputTokens: outputTokens,
					totalCost: 0, // No cost tracking for local setup
				}
				didOutputUsage = true
			}
		} catch (error) {
			console.error("Aeriocode API Error:", error)
			throw error
		}
	}

	async getApiStreamUsage(): Promise<ApiStreamUsageChunk | undefined> {
		if (this.lastGenerationId) {
			try {
				// TODO: replace this with firebase auth
				// TODO: use global API Host

				const response = await axios.get(`${this._baseUrl}/api/v1/generation?id=${this.lastGenerationId}`, {
					headers: {
						Authorization: `Bearer ${this.options.aeriocodeAccountId}`,
						"X-Session-ID": this.options.aeriocodeAccountId, // Pass session ID as header for aeriocode backend
					},
					timeout: 15_000, // this request hangs sometimes
				})

				const generation = response.data
				return {
					type: "usage",
					cacheWriteTokens: 0,
					cacheReadTokens: generation?.native_tokens_cached || 0,
					// openrouter generation endpoint fails often
					inputTokens: (generation?.native_tokens_prompt || 0) - (generation?.native_tokens_cached || 0),
					outputTokens: generation?.native_tokens_completion || 0,
					totalCost: generation?.total_cost || 0,
				}
			} catch (error) {
				// ignore if fails
				console.error("Error fetching aeriocode generation details:", error)
			}
		}
		return undefined
	}

	/**
	 * Fetch available models from the backend
	 */
	private async fetchAvailableModels(): Promise<void> {
		try {
			const aeriocodeAccountAuthToken = await this._authService.getAuthToken()
			if (!aeriocodeAccountAuthToken) {
				console.warn("No auth token available for fetching models")
				return
			}

			const response = await axios.get(`${this._baseUrl}/api/v1/models`, {
				headers: {
					Authorization: `Bearer ${aeriocodeAccountAuthToken}`,
					"X-Session-ID": aeriocodeAccountAuthToken, // Pass session ID as header for aeriocode backend
					"HTTP-Referer": "https://aeriocode.bot",
					"X-Title": "Aeriocode",
					"X-Aeriocode-Version": extensionVersion,
				},
				withCredentials: true, // Include cookies in the request for session-based auth
			})

			if (response.data && response.data.data && Array.isArray(response.data.data)) {
				// Store model IDs and convert backend models to ModelInfo format
				this.availableModelIds = response.data.data.map((backendModel: any) => backendModel.id)
				this.availableModels = response.data.data.map((backendModel: any) => ({
					maxTokens: 32000, // Default max tokens
					contextWindow: 1_000_000, // Default context window
					supportsImages: false,
					supportsPromptCache: false,
					inputPrice: 0,
					outputPrice: 0,
					description: `AerioCode model: ${backendModel.id}`,
				}))

				// Only set current model to first available if we have models AND no model is currently set
				// This prevents overriding user's model selection
				if (this.availableModels.length > 0 && !this.currentModelId) {
					this.currentModelId = this.availableModelIds[0]
				}
			}
		} catch (error) {
			console.error("Failed to fetch available models:", error)
			// Fall back to default models
			this.availableModels = [backendDefaultModelInfo]
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		// If we have fetched models, use the current one if it exists in the list
		if (this.availableModels.length > 0 && this.availableModelIds.length > 0) {
			const currentModelIndex = this.availableModelIds.indexOf(this.currentModelId)
			if (currentModelIndex >= 0) {
				return { id: this.availableModelIds[currentModelIndex], info: this.availableModels[currentModelIndex] }
			}

			// ⚠️ Retired model, and the server has already said so. `AerioCode-DO178C` and
			// `AerioCode-JFAVpp` were dropped from AiRoute's `/v1/models` when the compliance
			// variants stopped being models; a user who had one selected keeps it in their stored
			// configuration, and `server.py` rejects anything outside the three real ids with a
			// **400 on every request**. Sending it anyway made the setting permanently broken with
			// nothing in the UI explaining why.
			//
			// This branch used to fall through on the grounds that the list may not be fetched yet.
			// That reason is real and is why the guard requires a *non-empty* list: before the fetch
			// there is nothing to contradict the stored id, so it is still used unchanged below.
			const fallback = this.availableModelIds.includes(backendDefaultModelId)
				? backendDefaultModelId
				: this.availableModelIds[0]
			console.warn(
				`Model "${this.currentModelId}" is no longer offered by the backend; using "${fallback}". ` +
					`Available: ${this.availableModelIds.join(", ")}.`,
			)
			this.currentModelId = fallback
			const fallbackIndex = this.availableModelIds.indexOf(fallback)
			return { id: fallback, info: this.availableModels[fallbackIndex] }
		}

		// If we haven't fetched models yet or the current model is not in the list,
		// return the current model with default info
		// This ensures we use the model selected in the UI even before available models are loaded
		if (this.currentModelId) {
			return {
				id: this.currentModelId,
				info: this.availableModels.length > 0 ? this.availableModels[0] : backendDefaultModelInfo,
			}
		}

		// Fall back to default
		return { id: backendDefaultModelId, info: backendDefaultModelInfo }
	}

	/**
	 * Get all available models
	 */
	getAvailableModels(): ModelInfo[] {
		return this.availableModels.length > 0 ? this.availableModels : [backendDefaultModelInfo]
	}

	/**
	 * Set the current model
	 */
	setModel(modelId: string): void {
		this.currentModelId = modelId
	}

	/**
	 * Get models for the extension's model selector
	 */
	async getModelsForSelector(): Promise<ModelInfo[]> {
		await this.fetchAvailableModels()
		return this.getAvailableModels()
	}
}
