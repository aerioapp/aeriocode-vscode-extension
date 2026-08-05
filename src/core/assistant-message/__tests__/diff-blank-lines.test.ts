import { constructNewFileContent } from "../diff"
import { describe, it } from "mocha"
import { expect } from "chai"

/**
 * A SEARCH block that dropped the file's blank lines still matches.
 *
 * ⚠️ From a real session, on a file the model had written itself minutes earlier. Asked to bring it
 * into conformance with the coding standard, it produced a SEARCH block reproducing every line of
 * code correctly and omitting the blank lines between the groups. The edit failed, the file was
 * reverted, and the model was told its search "does not match anything in the file" — which is true
 * and useless, because the code it quoted was right.
 *
 * All three existing strategies fail on this together, for one shared reason: they compare by
 * position. Line-trimmed walks the two line lists in step, and block-anchor looks for the closing
 * anchor at a fixed offset. A dropped blank line shifts every subsequent index by one, so both miss.
 *
 * This matters more than it did before the gate began directing repairs to `replace_in_file`: a
 * repair tool that fails on whitespace it cannot be expected to remember is not one to build a
 * convergence loop on.
 */
describe("a SEARCH block missing the file's blank lines", () => {
	/** The file as recorded, trimmed to the region the edit targeted. */
	const original = [
		"#define MAX_ALTITUDE_FT 30000",
		'#define BUILD_TAG "fcs-2a"',
		"",
		"// ARINC 429 labels are octal by convention on this bus.",
		"const int32 LABEL_ALTITUDE = 131;",
		"",
		"// Loop timing and gains.",
		"const float64 DERIVATIVE_GAIN = 0.35F;",
		"",
		"// PID gains",
		"const float64 KP = 0.02;",
		"",
		"struct ControlState {",
		"};",
		"",
	].join("\n")

	it("applies the edit instead of reverting the file", async () => {
		// The model's block: same code, no blank lines.
		const diff = [
			"------- SEARCH",
			"// Loop timing and gains.",
			"const float64 DERIVATIVE_GAIN = 0.35F;",
			"// PID gains",
			"const float64 KP = 0.02;",
			"=======",
			"// Loop timing and gains.",
			"const float64 DERIVATIVE_GAIN = 0.35F;",
			"",
			"// PID gains",
			"const float64 KP = 0.02F;",
			"+++++++ REPLACE",
			"",
		].join("\n")

		const result = await constructNewFileContent(diff, original, true, "v2")

		expect(result).to.contain("const float64 KP = 0.02F;")
		// Everything outside the block is untouched — a match that swallowed neighbouring lines would
		// be worse than no match at all.
		expect(result).to.contain('#define BUILD_TAG "fcs-2a"')
		expect(result).to.contain("struct ControlState {")
	})

	it("still refuses a block whose code does not match", async () => {
		// Blank lines are forgiven; wrong code is not. This is the whole boundary of the change — a
		// matcher that also tolerated altered text would let a repair land on the wrong region.
		const diff = [
			"------- SEARCH",
			"// Loop timing and gains.",
			"const float64 DERIVATIVE_GAIN = 0.99F;",
			"const float64 KP = 0.02;",
			"=======",
			"replaced",
			"+++++++ REPLACE",
			"",
		].join("\n")

		let failed = false
		try {
			await constructNewFileContent(diff, original, true, "v2")
		} catch {
			failed = true
		}
		expect(failed).to.equal(true)
	})

	it("does not skip a non-blank line the block omitted", async () => {
		// Consuming any intervening line rather than only blank ones would silently delete code the
		// model did not mention. Blank lines are skipped; `const int32 LABEL_ALTITUDE` is not.
		const diff = [
			"------- SEARCH",
			"// ARINC 429 labels are octal by convention on this bus.",
			"// Loop timing and gains.",
			"=======",
			"replaced",
			"+++++++ REPLACE",
			"",
		].join("\n")

		let failed = false
		try {
			await constructNewFileContent(diff, original, true, "v2")
		} catch {
			failed = true
		}
		expect(failed).to.equal(true)
	})

	it("leaves an exactly-matching block to the exact path", async () => {
		// The new strategy runs last, so ordinary edits are unaffected by it.
		const diff = [
			"------- SEARCH",
			"const float64 KP = 0.02;",
			"=======",
			"const float64 KP = 0.05;",
			"+++++++ REPLACE",
			"",
		].join("\n")

		const result = await constructNewFileContent(diff, original, true, "v2")

		expect(result).to.contain("const float64 KP = 0.05;")
		expect(result).to.contain("const float64 DERIVATIVE_GAIN = 0.35F;")
	})
})

/**
 * Indented SEARCH/REPLACE markers are markers.
 *
 * ⚠️ Anchored patterns meant `    ------- SEARCH` matched nothing, so the diff parsed as containing
 * **no blocks at all** — and the file came back unchanged with no error raised. The user is told the
 * edit succeeded and nothing happened, which is worse than a rejection: a rejection can be retried.
 *
 * The model indents them for the obvious reason — it is editing inside a class body and matching the
 * surrounding code. Five of twelve C++ modify tasks failed exactly this way, each producing three or
 * four well-formed `replace_in_file` calls quoting real lines from the file, none of which applied.
 */
describe("SEARCH/REPLACE markers written with indentation", () => {
	const original = "class W {\n    // Live count.\n    int size() const\n    {\n        return n_;\n    }\n};\n"

	it("applies the edit", async () => {
		const diff = "    ------- SEARCH\n    // Live count.\n    =======\n    // Live count, updated.\n    +++++++ REPLACE\n"
		const result = await constructNewFileContent(diff, original, true, "v2")

		expect(result).to.contain("// Live count, updated.")
		expect(result).to.contain("class W {")
	})

	it("still applies an unindented one", async () => {
		const diff = "------- SEARCH\n    // Live count.\n=======\n    // Live count, updated.\n+++++++ REPLACE\n"
		const result = await constructNewFileContent(diff, original, true, "v2")

		expect(result).to.contain("// Live count, updated.")
	})

	it("preserves the indentation of the replacement itself", async () => {
		// Only the marker lines are trimmed for detection. The content between them is the file's, and
		// trimming that would reindent the code being written.
		const diff = "    ------- SEARCH\n    int size() const\n    =======\n        int size() const\n    +++++++ REPLACE\n"
		const result = await constructNewFileContent(diff, original, true, "v2")

		expect(result).to.contain("        int size() const")
	})
})
