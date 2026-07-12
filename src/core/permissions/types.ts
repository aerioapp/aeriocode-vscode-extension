/**
 * Configuration structure for command permissions from environment variable
 */
export interface CommandPermissionConfig {
	allow?: string[]
	deny?: string[]
	allowRedirects?: boolean
}

/**
 * Result of a permission validation check
 */
export interface PermissionValidationResult {
	allowed: boolean
	matchedPattern?: string
	reason:
		| "no_config"
		| "allowed"
		| "denied"
		| "no_match_deny_default"
		| "shell_operator_detected"
		| "redirect_detected"
		| "segment_denied"
		| "segment_no_match"
	detectedOperator?: string
	failedSegment?: string
}

/**
 * Environment variable name for command permissions
 */
export const COMMAND_PERMISSIONS_ENV_VAR = "AERIOCODE_COMMAND_PERMISSIONS"

/**
 * Shell operators that indicate command chaining, piping, substitution, or redirection.
 * These are security-sensitive because they can be used to bypass command restrictions.
 */
export interface ShellOperatorMatch {
	operator: string
	description: string
}
