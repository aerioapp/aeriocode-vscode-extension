import { describe, it } from "mocha"
import { expect } from "chai"
import { MAX_FILES, MAX_TOTAL_BYTES, extensionsForLanguages } from "../complianceFileScope"

/**
 * Scope resolution decides which files leave the user's machine, so the parts that can be
 * tested without a live workspace — the language-to-extension mapping and the request
 * caps — are pinned here. The vscode-dependent walking is exercised by the panel itself.
 */

describe("extensionsForLanguages", () => {
	it("maps cpp to the extensions the backend grammar accepts", () => {
		const extensions = extensionsForLanguages(["cpp"])

		for (const expected of [".cpp", ".cc", ".cxx", ".h", ".hh", ".hpp", ".hxx", ".inl", ".c"]) {
			expect(extensions, `missing ${expected}`).to.include(expected)
		}
	})

	it("merges without duplicating shared extensions", () => {
		const extensions = extensionsForLanguages(["c", "cpp"])
		expect(extensions.filter((entry) => entry === ".h")).to.have.length(1)
	})

	it("returns nothing for a language it does not know", () => {
		// Matching everything would offer files the backend can only skip, which reads to
		// the user as "checked" when nothing was checked.
		expect(extensionsForLanguages(["ada"])).to.deep.equal([])
		expect(extensionsForLanguages([])).to.deep.equal([])
	})
})

describe("request caps", () => {
	it("match the limits the backend route enforces", () => {
		// Diverging from the backend would mean the panel offers a selection the server
		// rejects, with an error the user cannot act on.
		expect(MAX_FILES).to.equal(50)
		expect(MAX_TOTAL_BYTES).to.equal(2 * 1024 * 1024)
	})
})
