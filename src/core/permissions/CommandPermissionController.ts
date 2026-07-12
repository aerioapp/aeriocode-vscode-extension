import { ParseEntry, parse } from "shell-quote"
import { Logger } from "@services/logging/Logger"
import { COMMAND_PERMISSIONS_ENV_VAR, CommandPermissionConfig, PermissionValidationResult, ShellOperatorMatch } from "./types"

const REDIRECT_OPERATORS = new Set([">", ">>", "<", ">&", "<&", "|&", "<(", ">("])
const COMMAND_SEPARATOR_OPERATORS = new Set(["&&", "||", "|", ";"])

const LINE_SEPARATOR_REGEX = /[\n\r\u2028\u2029\u0085]/
const LINE_SEPARATOR_DESCRIPTIONS: Record<string, ShellOperatorMatch> = {
	"\n": { operator: "\\n", description: "newline (command separator)" },
	"\r": { operator: "\\r", description: "carriage return (potential command separator)" },
	"\u2028": { operator: "U+2028", description: "unicode line separator" },
	"\u2029": { operator: "U+2029", description: "unicode paragraph separator" },
	"\u0085": { operator: "U+0085", description: "unicode next line" },
}

/**
 * Result of parsing a command into segments (recursive structure)
 */
interface ParsedCommand {
	segments: string[]
	subshells: ParsedCommand[]
	hasRedirects: boolean
}

/**
 * Controls command execution permissions based on environment variable configuration.
 * Uses glob pattern matching to allow/deny specific commands.
 *
 * Configuration is read from the AERIOCODE_COMMAND_PERMISSIONS environment variable.
 * Format: {"allow": ["pattern1", "pattern2"], "deny": ["pattern3"], "allowRedirects": true}
 *
 * Rule evaluation for chained commands (e.g., "cd /tmp && npm test"):
 * 1. Parse command into segments split by operators (&&, ||, |, ;)
 * 2. Check for dangerous characters (backticks outside single quotes, newlines outside quotes)
 * 3. If redirects detected and allowRedirects !== true → DENIED
 * 4. Validate EACH segment against allow/deny rules - ALL must pass
 * 5. Recursively validate any subshell contents
 * 6. If no rules are defined (env var not set) → ALLOWED (backward compatibility)
 */
export class CommandPermissionController {
	private config: CommandPermissionConfig | null = null

	constructor() {
		this.config = this.parseConfig()
	}

	/**
	 * Parse the AERIOCODE_COMMAND_PERMISSIONS environment variable
	 */
	private parseConfig(): CommandPermissionConfig | null {
		const envValue = process.env[COMMAND_PERMISSIONS_ENV_VAR]
		if (!envValue) {
			return null
		}

		try {
			const parsed = JSON.parse(envValue)
			return {
				allow: Array.isArray(parsed.allow) ? parsed.allow : undefined,
				deny: Array.isArray(parsed.deny) ? parsed.deny : undefined,
				allowRedirects: typeof parsed.allowRedirects === "boolean" ? parsed.allowRedirects : undefined,
			}
		} catch (error) {
			Logger.error(`Failed to parse ${COMMAND_PERMISSIONS_ENV_VAR}:`, error)
			return null
		}
	}

	/**
	 * Validate if a command is allowed to execute based on configured permissions.
	 */
	validateCommand(command: string): PermissionValidationResult {
		if (!this.config) {
			return { allowed: true, reason: "no_config" }
		}

		const dangerousChar = this.detectDangerousCharsOutsideQuotes(command)
		if (dangerousChar) {
			return {
				allowed: false,
				reason: "shell_operator_detected",
				detectedOperator: dangerousChar.operator,
			}
		}

		const parseResult = this.parseCommandSegments(command)
		if (!parseResult) {
			return {
				allowed: false,
				reason: "shell_operator_detected",
				detectedOperator: "parse_error",
			}
		}

		const result = this.validateParsedCommand(parseResult, command)
		return result
	}

	/**
	 * Recursively validate a parsed command structure
	 */
	private validateParsedCommand(parsed: ParsedCommand, fullCommand: string): PermissionValidationResult {
		if (parsed.hasRedirects && !this.config?.allowRedirects) {
			return {
				allowed: false,
				reason: "redirect_detected",
			}
		}

		const isMultiSegment = parsed.segments.length > 1 || parsed.subshells.length > 0
		for (const segment of parsed.segments) {
			const result = this.validateSingleCommand(segment)
			if (!result.allowed) {
				if (isMultiSegment) {
					return {
						...result,
						failedSegment: segment,
						reason:
							result.reason === "denied"
								? "segment_denied"
								: result.reason === "no_match_deny_default"
									? "segment_no_match"
									: result.reason,
					}
				}
				return result
			}
		}

		for (const subshell of parsed.subshells) {
			const result = this.validateParsedCommand(subshell, fullCommand)
			if (!result.allowed) {
				return result
			}
		}

		return { allowed: true, reason: "allowed" }
	}

	/**
	 * Validate a single command (no operators) against allow/deny rules.
	 */
	private validateSingleCommand(command: string): PermissionValidationResult {
		if (this.config?.deny) {
			for (const pattern of this.config.deny) {
				if (this.matchesPattern(command, pattern)) {
					return { allowed: false, matchedPattern: pattern, reason: "denied" }
				}
			}
		}

		if (this.config?.allow && this.config.allow.length > 0) {
			for (const pattern of this.config.allow) {
				if (this.matchesPattern(command, pattern)) {
					return { allowed: true, matchedPattern: pattern, reason: "allowed" }
				}
			}
			return { allowed: false, reason: "no_match_deny_default" }
		}

		return { allowed: true, reason: "no_config" }
	}

	private parseCommandSegments(input: string): ParsedCommand {
		let tokens: ParseEntry[] = []
		try {
			tokens = parse(input)
		} catch (err) {
			Logger.error("Error parsing command: " + (err as Error).message)
			return { segments: [], subshells: [], hasRedirects: false }
		}

		function process(tokenList: ParseEntry[]): ParsedCommand {
			const result: ParsedCommand = {
				segments: [],
				subshells: [],
				hasRedirects: false,
			}

			let currentSegmentParts: string[] = []

			const flushSegment = () => {
				if (currentSegmentParts.length > 0) {
					result.segments.push(currentSegmentParts.join(" "))
					currentSegmentParts = []
				}
			}

			for (let i = 0; i < tokenList.length; i++) {
				const token = tokenList[i]

				// 1. Handle Subshells: ( ... )
				if (typeof token === "object" && "op" in token && token.op === "(") {
					flushSegment()

					let balance = 1
					let j = i + 1
					const subTokens: ParseEntry[] = []

					while (j < tokenList.length && balance > 0) {
						const subToken = tokenList[j]
						if (typeof subToken === "object" && "op" in subToken) {
							if (subToken.op === "(") {
								balance++
							}
							if (subToken.op === ")") {
								balance--
							}
						}

						if (balance > 0) {
							subTokens.push(subToken)
						}
						j++
					}

					result.subshells.push(process(subTokens))
					i = j - 1
					continue
				}

				// 2. Handle Logic Separators: &&, ||, ;, |
				if (typeof token === "object" && "op" in token && COMMAND_SEPARATOR_OPERATORS.has(token.op as string)) {
					flushSegment()
					continue
				}

				// 3. Handle Redirect Operators: >, >>, <, etc.
				if (typeof token === "object" && "op" in token && REDIRECT_OPERATORS.has(token.op as string)) {
					result.hasRedirects = true
					continue
				}

				// 4. Handle Strings (Commands and Arguments)
				if (typeof token === "string") {
					const nextToken = tokenList[i + 1]
					if (token === "$" && typeof nextToken === "object" && "op" in nextToken && nextToken.op === "(") {
						currentSegmentParts.push(token)
						continue
					}
					currentSegmentParts.push(token)
				}
				// 5. Handle Glob/Pattern objects
				else if (typeof token === "object" && "pattern" in token) {
					currentSegmentParts.push(token.pattern)
				}
			}

			flushSegment()
			return result
		}

		return process(tokens)
	}

	/**
	 * Check if a command matches a wildcard pattern.
	 */
	private matchesPattern(command: string, pattern: string): boolean {
		const regex = new RegExp(
			"^" +
				pattern
					.replace(/[.+^${}()|[\]\\]/g, "\\$&")
					.replace(/\*/g, ".*")
					.replace(/\?/g, ".") +
				"$",
			"s",
		)
		return regex.test(command)
	}

	/**
	 * Detect dangerous characters outside of quoted strings.
	 */
	private detectDangerousCharsOutsideQuotes(command: string): ShellOperatorMatch | null {
		let inSingleQuote = false
		let inDoubleQuote = false
		let isEscaped = false

		for (let i = 0; i < command.length; i++) {
			const char = command[i]

			if (isEscaped) {
				isEscaped = false
				continue
			}

			if (char === "\\" && !inSingleQuote) {
				isEscaped = true
				continue
			}

			if (char === '"' && !inSingleQuote) {
				inDoubleQuote = !inDoubleQuote
				continue
			}

			if (char === "'" && !inDoubleQuote) {
				inSingleQuote = !inSingleQuote
				continue
			}

			const inAnyQuote = inSingleQuote || inDoubleQuote

			if (!inAnyQuote && LINE_SEPARATOR_REGEX.test(char)) {
				return LINE_SEPARATOR_DESCRIPTIONS[char]
			}

			if (char === "`" && !inSingleQuote) {
				return { operator: "`", description: "command substitution (backtick)" }
			}
		}

		return null
	}
}
