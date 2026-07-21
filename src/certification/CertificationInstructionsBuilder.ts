import type { CertificationProfile, RequirementRow } from "./types"

/**
 * Builds certification instructions for the AI system prompt.
 * Injected as user instructions so the backend incorporates it into the system prompt.
 *
 * All output is driven by the profile's terminology — no standard-specific hardcoding.
 */
export class CertificationInstructionsBuilder {
	/**
	 * Build the full certification instructions block.
	 * Returns empty string if no requirements exist.
	 */
	static build(profile: CertificationProfile, requirements: RequirementRow[]): string {
		if (!profile || !requirements || requirements.length === 0) {
			return ""
		}

		const sections: string[] = []

		// Header — uses profile.standard generically
		sections.push(`# CERTIFICATION MODE ACTIVE — ${profile.standard} ${profile.version}`)
		sections.push("")
		sections.push(
			"You are operating in a certification-governed project. The following requirements MUST be traced in all generated code.",
		)
		sections.push("")

		// Requirements list — dal_level is displayed as a generic classification
		sections.push("## Active Requirements")
		sections.push("")
		for (const req of requirements) {
			const classification = req.dal_level ? ` [${req.dal_level}]` : ""
			const desc = req.description ? `\n  Description: ${req.description}` : ""
			const rationale = req.rationale ? `\n  Rationale: ${req.rationale}` : ""
			const source = req.source ? `\n  Source: ${req.source}` : ""
			sections.push(`- **${req.requirement_id}** (${req.level})${classification}: ${req.title}${desc}${rationale}${source}`)
		}
		sections.push("")

		// Tag format — dynamically built from profile's requirement_id_patterns
		sections.push("## Requirement Tag Format")
		sections.push("")
		sections.push(
			"When generating or modifying source code, you MUST add requirement tags as comments above each function or code block that implements a requirement:",
		)
		sections.push("")

		// Use the first requirement ID as an example
		const exampleId = requirements[0]?.requirement_id || "REQ-001"
		sections.push(`  // ${exampleId}: Description of what this function does`)
		sections.push("  function yourFunction(args) { ... }")
		sections.push("")

		if (profile.requirement_id_patterns && profile.requirement_id_patterns.length > 0) {
			sections.push("Supported tag formats:")
			for (const pattern of profile.requirement_id_patterns) {
				sections.push(`  // ${pattern}: description`)
			}
			sections.push("")
		}

		sections.push("Rules for tagging:")
		sections.push("1. Add the tag comment on the line immediately above the function definition")
		sections.push(
			"2. Use the EXACT requirement_id from the Active Requirements list above — the tag must match the ID character-for-character",
		)
		sections.push("3. Each function that implements a requirement MUST have exactly one tag")
		sections.push("4. If a function implements multiple requirements, add multiple tag lines")
		sections.push("5. The tag description should summarize how this specific function satisfies the requirement")
		sections.push("")

		// Safety coding rules
		if (profile.safety_coding_rules) {
			sections.push("## Safety Coding Rules")
			sections.push("")
			sections.push(`Follow ${profile.safety_coding_rules} coding standards.`)
			sections.push("")
		}

		// Coding standards
		if (profile.coding_standards && profile.coding_standards.length > 0) {
			sections.push("## Applicable Coding Standards")
			sections.push("")
			sections.push(profile.coding_standards.join(", "))
			sections.push("")
		}

		// Level context — uses profile.levels generically (DAL, ASIL, safety class, etc.)
		const levels = Object.entries(profile.levels)
		if (levels.length > 0) {
			sections.push("## Classification Level Context")
			sections.push("")
			for (const [, level] of levels) {
				const coverageDesc = level.coverage_metric ? ` — requires ${level.coverage_metric}` : ""
				sections.push(`- ${level.label}: ${level.failure_condition}${coverageDesc}`)
			}
			sections.push("")
		}

		return sections.join("\n")
	}
}
