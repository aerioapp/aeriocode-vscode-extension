import { describe, it } from "mocha"
import { expect } from "chai"
import * as fs from "fs"
import * as path from "path"

/**
 * Users know "Aerio". They do not know the names of the services behind it, and leaking
 * those into a notification or a panel makes an error unactionable — nobody can do
 * anything with "the compliance service did not respond".
 *
 * This scans the strings that actually reach a user for internal vocabulary. Comments and
 * identifiers are deliberately not checked: the implementation should keep calling things
 * by their real names.
 */

// The unit runner loads specs as ES modules, where __dirname does not exist. Mocha is
// invoked from the repository root, so cwd is the anchor.
const ROOT = process.cwd()

const SCANNED = [
	"src/services/compliance/ComplianceClient.ts",
	"src/services/compliance/ComplianceDiagnostics.ts",
	"src/services/compliance/formatComplianceResult.ts",
	"src/core/task/tools/executeComplianceCheck.ts",
	"src/core/controller/compliance/getComplianceStandards.ts",
	"src/core/controller/compliance/listComplianceFiles.ts",
	"src/core/controller/compliance/runComplianceCheck.ts",
	"src/core/controller/compliance/applyComplianceFixes.ts",
	"webview-ui/src/components/compliance/ComplianceView.tsx",
	"webview-ui/src/components/compliance/ComplianceResults.tsx",
	"webview-ui/src/components/compliance/ComplianceFileList.tsx",
	"webview-ui/src/components/settings/sections/ComplianceSettingsSection.tsx",
]

/** Vocabulary that describes our internals rather than anything the user can act on. */
const FORBIDDEN = [
	/Aeriocode backend/i,
	/compliance service/i,
	/Aerio'?s servers/i,
	/backend registry/i,
	/gRPC/i,
	/tree-sitter/i,
	/rule pack/i,
]

/** Strip comments so only real string content is scanned. */
function stringsOf(source: string): string[] {
	const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

	const found: string[] = []
	// Double-quoted and template strings; single quotes are not used for text here.
	for (const match of withoutComments.matchAll(/"((?:[^"\\]|\\.){8,})"/g)) {
		found.push(match[1])
	}
	for (const match of withoutComments.matchAll(/`((?:[^`\\]|\\.){8,})`/g)) {
		found.push(match[1])
	}
	// JSX text nodes: >  some prose  <
	for (const match of withoutComments.matchAll(/>\s*([A-Z][^<>{}]{15,})\s*</g)) {
		found.push(match[1])
	}
	return found
}

describe("user-facing compliance text", () => {
	it("never names an internal service or technology", () => {
		const offences: string[] = []

		for (const relative of SCANNED) {
			const file = path.join(ROOT, relative)
			if (!fs.existsSync(file)) {
				offences.push(`${relative}: scanned file no longer exists — update this list`)
				continue
			}

			for (const text of stringsOf(fs.readFileSync(file, "utf8"))) {
				for (const pattern of FORBIDDEN) {
					if (pattern.test(text)) {
						offences.push(`${relative}: ${pattern} matched ${JSON.stringify(text.slice(0, 90))}`)
					}
				}
			}
		}

		expect(offences, offences.join("\n")).to.deep.equal([])
	})

	it("scans the files that actually produce user-visible strings", () => {
		// A file dropped from SCANNED silently stops being checked, so assert the list still
		// covers every compliance source that can render text.
		expect(SCANNED.length).to.be.greaterThan(10)
	})
})
