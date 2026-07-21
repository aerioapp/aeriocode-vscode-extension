import type { ParsedRequirementTag, UntracedFunction } from "./types"

/**
 * RequirementTagParser - Parse requirement tags from source code.
 * Matches patterns like:
 *   // REQ-SYS-001: System requirement description
 *   // HLR-042: High-level requirement
 *   // LLR-007: Low-level requirement
 *   // SYS-REQ-001: System requirement
 *
 * Also parses optional annotations on subsequent lines:
 *   // DAL Level: A
 *   // Safety-Critical: Yes
 */
export class RequirementTagParser {
	// Main regex for requirement tags — captures full requirement ID (e.g., REQ-SYS-001, HLR-42, LLR-7, SYS-1)
	private static readonly TAG_REGEX = /\/\/\s*(REQ-[A-Za-z0-9_-]+|HLR-\d+|LLR-\d+|SYS-\d+):\s*(.+)/g

	// Optional DAL level annotation
	private static readonly DAL_REGEX = /\/\/\s*DAL\s*Level:\s*([A-E])/i

	// Optional safety-critical annotation
	private static readonly SAFETY_REGEX = /\/\/\s*Safety-Critical:\s*(Yes|No|True|False)/i

	/**
	 * Parse all requirement tags from a file's content.
	 */
	static parse(content: string, filePath: string): ParsedRequirementTag[] {
		const tags: ParsedRequirementTag[] = []
		const lines = content.split("\n")

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const regex = new RegExp(this.TAG_REGEX.source, "g")
			let match: RegExpExecArray | null

			while ((match = regex.exec(line)) !== null) {
				// Extract requirement ID from the capture group
				const reqId = match[1]
				const description = match[2]?.trim() || ""

				if (!reqId) continue

				// Check next lines for DAL and safety annotations
				let level: string | undefined
				let safetyCritical: boolean | undefined

				if (i + 1 < lines.length) {
					const nextLine = lines[i + 1]
					const dalMatch = this.DAL_REGEX.exec(nextLine)
					if (dalMatch) {
						level = dalMatch[1].toUpperCase()
					}

					const safetyMatch = this.SAFETY_REGEX.exec(nextLine)
					if (safetyMatch) {
						safetyCritical = safetyMatch[1].toLowerCase() === "yes" || safetyMatch[1].toLowerCase() === "true"
					}
				}

				tags.push({
					requirement_id: reqId,
					description,
					level,
					safety_critical: safetyCritical,
					line: i + 1, // 1-indexed
					column: match.index,
				})
			}
		}

		return tags
	}

	/**
	 * Validate that all found tags reference existing requirements.
	 */
	static validateTags(
		tags: ParsedRequirementTag[],
		existingRequirements: string[],
	): { valid: ParsedRequirementTag[]; invalid: ParsedRequirementTag[] } {
		const reqSet = new Set(existingRequirements)
		const valid: ParsedRequirementTag[] = []
		const invalid: ParsedRequirementTag[] = []

		for (const tag of tags) {
			if (reqSet.has(tag.requirement_id)) {
				valid.push(tag)
			} else {
				invalid.push(tag)
			}
		}

		return { valid, invalid }
	}

	/**
	 * Find functions in source code that don't have requirement tags.
	 * Supports C, C++, Python, and similar languages.
	 */
	static findUntracedFunctions(content: string, filePath: string, existingTags: ParsedRequirementTag[]): UntracedFunction[] {
		const lines = content.split("\n")
		const untraced: UntracedFunction[] = []
		const language = this.detectLanguage(filePath)

		// Build a set of lines that have requirement tags
		const taggedLines = new Set(existingTags.map((t) => t.line))

		// Simple function detection patterns
		const functionPatterns = this.getFunctionPatterns(language)

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			for (const pattern of functionPatterns) {
				const match = pattern.exec(line)
				if (match) {
					const funcName = match[1] || match[2] || "anonymous"

					// Check if this function has a requirement tag above it (within 5 lines)
					let hasTag = false
					for (let j = Math.max(0, i - 5); j <= i; j++) {
						if (taggedLines.has(j + 1)) {
							// +1 for 1-indexed
							hasTag = true
							break
						}
					}

					if (!hasTag) {
						// Find the end of the function (simple heuristic: look for next function or end of file)
						let endLine = lines.length - 1
						for (let j = i + 1; j < lines.length; j++) {
							if (lines[j].trim() === "}" || lines[j].trim() === "end") {
								endLine = j
								break
							}
						}

						untraced.push({
							name: funcName,
							start_line: i + 1,
							end_line: endLine + 1,
							file_path: filePath,
							language,
						})
					}

					break // Only match one pattern per line
				}
			}
		}

		return untraced
	}

	/**
	 * Detect programming language from file extension.
	 */
	private static detectLanguage(filePath: string): string {
		const ext = filePath.split(".").pop()?.toLowerCase() || ""
		const langMap: Record<string, string> = {
			c: "c",
			h: "c",
			cpp: "cpp",
			cxx: "cpp",
			cc: "cpp",
			hpp: "cpp",
			py: "python",
			java: "java",
			js: "javascript",
			ts: "typescript",
			go: "go",
			rs: "rust",
		}
		return langMap[ext] || "unknown"
	}

	/**
	 * Get function detection patterns for a language.
	 */
	private static getFunctionPatterns(language: string): RegExp[] {
		switch (language) {
			case "c":
			case "cpp":
				// Match: type funcName(args) { or type funcName(args) const {
				return [
					/^(?:static\s+|extern\s+|inline\s+)*(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{/,
					/^(?:static\s+|extern\s+|inline\s+)*(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*;/,
				]
			case "python":
				// Match: def funcName(args):
				return [/^\s*def\s+(\w+)\s*\(/]
			case "java":
			case "javascript":
			case "typescript":
				// Match: funcName(args) { or funcName(args) =>
				return [
					/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
					/^\s*(?:public|private|protected|static)\s+\w+\s+(\w+)\s*\(/,
				]
			case "go":
				// Match: func funcName(args) {
				return [/^\s*func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/]
			case "rust":
				// Match: fn funcName(args) {
				return [/^\s*(?:pub\s+)?fn\s+(\w+)\s*\(/]
			default:
				return []
		}
	}
}
