import { detectMalformedToolUse, formatResponse } from "../responses"
import { describe, it } from "mocha"
import { expect } from "chai"

/**
 * Telling the model what it actually got wrong.
 *
 * ⚠️ From the same real session as `parse-mismatched-close.test.ts`. Asked to write a PID
 * controller, the model produced a complete, correct C++ file wrapped in `<writing_to_file>` — a
 * tag it invented — with `<path>` and `<content>` inside it. No known tool tag matched, so the
 * harness answered "You did not use a tool in your previous response!".
 *
 * That is false, and the falseness is the whole cost. The model had used a tool; told it had not,
 * it had nothing to correct. It then read a file it had never written, re-read one it had, and
 * burned four turns before recovering by chance. Naming the tag turns that into one turn.
 *
 * The model's habit is visible earlier in the same session: it wrapped a *correct* `<read_file>`
 * call in `<reading_file>…</reading_file>`. That one worked, because the inner tag was real. On the
 * write it used the gerund form instead of the tool name rather than around it.
 */
describe("a tool call under a name that is not a tool", () => {
	/** The shape recorded in the session. */
	const recorded =
		"<writing_to_file>\n" +
		"<path>pid_controller.cpp</path>\n" +
		"<content>/*\n * PID Controller Implementation\n */\nint main() { return 0; }\n</content>\n" +
		"</writing_to_file>"

	it("is detected, and the offending tag is named", () => {
		const detected = detectMalformedToolUse(recorded)

		expect(detected).to.not.equal(undefined)
		expect(detected!.tag).to.equal("writing_to_file")
	})

	it("identifies the intended tool from the parameters it carried", () => {
		// A `path` and a `content` is a write, whatever the tag was called. Decided structurally
		// rather than by string distance — `writing_to_file` is not a near-miss of `write_to_file`
		// under any edit metric that would not also match several other tools.
		expect(detectMalformedToolUse(recorded)!.suggestedTool).to.equal("write_to_file")
	})

	it("produces a message that names the tag and shows the correct call", () => {
		const detected = detectMalformedToolUse(recorded)!
		const message = formatResponse.malformedToolUse(detected.tag, detected.suggestedTool)

		expect(message).to.contain("<writing_to_file>` is not a tool")
		expect(message).to.contain("write_to_file")
		expect(message).to.contain("<content>")
		// The claim that misled the model must not reappear.
		expect(message).to.not.contain("did not use a tool")
	})

	it("tells a wrapped call that the tag itself is the tool name", () => {
		// The `<reading_file><read_file>…` habit. If the wrapper ever replaces the tool tag rather
		// than surrounding it, this is the sentence that resolves it.
		const message = formatResponse.malformedToolUse("writing_to_file", "write_to_file")

		expect(message).to.contain("there is no wrapper element around it")
	})

	it("distinguishes an edit from a write by its parameters", () => {
		const detected = detectMalformedToolUse("<editing_file>\n<path>a.c</path>\n<diff>x</diff>\n</editing_file>")

		expect(detected!.suggestedTool).to.equal("replace_in_file")
	})

	it("names no tool when the parameters do not identify one", () => {
		// A guess would send the model to the wrong tool with confidence. The message falls back to
		// listing the valid names.
		const detected = detectMalformedToolUse("<some_wrapper>\n<question>what next?</question>\n</some_wrapper>")

		expect(detected!.tag).to.equal("some_wrapper")
		expect(detected!.suggestedTool).to.equal(undefined)
		expect(formatResponse.malformedToolUse(detected!.tag)).to.contain("Valid tool names are:")
	})

	describe("a call made in JSON function-call dialect", () => {
		// ⚠️ Found by the protocol harness against the live backend, not by review. Asked to write a
		// file, the model answered with the shape every other provider's function calling uses. No
		// XML tag exists anywhere in it, so the turn read as "no tool use" and the model was told it
		// had done nothing — when it had made a well-formed call in the wrong dialect.
		const recorded =
			'I will check the directory first.\n{\n  "tool": "list_files",\n  "tool_input": {\n    "path": ".",\n    "recursive": false\n  }\n}'

		it("is recognised as a tool call rather than as prose", () => {
			expect(detectMalformedToolUse(recorded)).to.not.equal(undefined)
		})

		it("names the format, not a tag", () => {
			// "`<JSON tool call>` is not a tool" would be gibberish, and the correction this needs is
			// about the format rather than the name.
			const detected = detectMalformedToolUse(recorded)!
			const message = formatResponse.malformedToolUse(detected.tag, detected.suggestedTool)

			expect(message).to.contain("JSON function-call format")
			expect(message).to.contain("XML-style tags")
			expect(message).to.not.contain("is not a tool.")
		})

		it("needs both a name and an arguments object, so prose about tools does not match", () => {
			expect(detectMalformedToolUse('The response has a "tool" field in it somewhere.')).to.equal(undefined)
		})
	})

	describe("does not fire on ordinary text", () => {
		it("ignores prose that merely mentions a tool-shaped tag", () => {
			// The distinguishing signal is carrying parameter tags, not looking like a tag. Prose
			// about the tools is common and must not be answered with an error.
			expect(detectMalformedToolUse("I will use <writing_to_file> to save this.")).to.equal(undefined)
		})

		it("ignores markup in a plain answer", () => {
			expect(detectMalformedToolUse("Here is the plan:\n\n1. Read the file\n2. Write it back")).to.equal(undefined)
		})

		it("does not attribute a later correct call's parameters to an earlier tag", () => {
			// Scanning to the end of the message rather than to the tag's own close would read the
			// `<path>` of the real call below as belonging to `<thinking>`, and report an error on a
			// turn that contains a perfectly good tool use.
			const message = "<thinking>I should write the file.</thinking>\n<read_file>\n<path>a.c</path>\n</read_file>"

			expect(detectMalformedToolUse(message)).to.equal(undefined)
		})
	})
})
