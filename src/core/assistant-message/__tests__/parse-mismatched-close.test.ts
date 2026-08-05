import { parseAssistantMessageV2, parseAssistantMessageV3 } from "../parse-assistant-message"
import { ToolUse } from ".."
import { describe, it } from "mocha"
import { expect } from "chai"

/**
 * A tool call closed by a different tool's closing tag is still that tool call.
 *
 * ⚠️ From a real user session, not a hypothetical. Asked to "write me a c++ pid controller loop",
 * the model opened `<write_to_file>`, wrote `<path>` and the whole file in `<content>`, closed
 * `</content>` — and then wrote **`</read_file>`**, the tool it had used in the previous turn.
 *
 * Nothing matched `</write_to_file>`, so the tool use stayed partial, was discarded at end of
 * stream, and the model received `incompleteToolUse()`: "your response ended in the middle of a
 * tool call — its closing tag never arrived". That was false, and being false is what made it
 * expensive: the model had closed the call, so it had nothing to change, and it resent the
 * byte-identical response twice before recovering by chance. Three round trips, a complete file
 * thrown away each time, and the user watched the file fail to be written three times.
 *
 * Both parsers are exercised. `parseAssistantMessageV3` is selected for next-gen model families and
 * V2 for everything else, and the close-tag handling was duplicated verbatim between them — so a
 * fix applied to one would leave the defect live for half the models.
 */
describe("a tool call closed by the wrong tool's tag", () => {
	const parsers: Array<[string, (message: string) => ReturnType<typeof parseAssistantMessageV2>]> = [
		["V2", parseAssistantMessageV2],
		["V3", parseAssistantMessageV3],
	]

	/** The shape recorded in the session, trimmed to the parts the parser acts on. */
	const recorded =
		"<write_to_file>\n" +
		"<path>pid_controller.cpp</path>\n" +
		"<content>\n" +
		"#include <iostream>\n" +
		"int main() {\n    return 0;\n}\n" +
		"</content>\n" +
		"</read_file>"

	for (const [label, parse] of parsers) {
		describe(label, () => {
			it("is parsed as the tool that was opened", () => {
				const blocks = parse(recorded)
				const tools = blocks.filter((block): block is ToolUse => block.type === "tool_use")

				expect(tools).to.have.lengthOf(1)
				expect(tools[0].name).to.equal("write_to_file")
				expect(tools[0].params.path).to.equal("pid_controller.cpp")
			})

			it("is complete, so it is not discarded at end of stream", () => {
				// The whole cost of the defect: `partial` left true meant the block was dropped and
				// the model was told it had been cut off.
				const tool = parse(recorded).find((block) => block.type === "tool_use") as ToolUse

				expect(tool.partial).to.equal(false)
			})

			it("keeps the content intact", () => {
				const tool = parse(recorded).find((block) => block.type === "tool_use") as ToolUse

				expect(tool.params.content).to.contain("#include <iostream>")
				expect(tool.params.content).to.contain("return 0;")
			})

			it("still prefers the tool's own closing tag when it arrives later", () => {
				// The guard that keeps this from closing a call early. A model that mentions another
				// tool's closing tag between parameters has not finished the call it is making, and
				// closing it here would truncate the parameters that follow.
				const message =
					"<write_to_file>\n" +
					"<path>a.c</path>\n" +
					"</read_file>\n" +
					"<content>int main(void) { return 0; }</content>\n" +
					"</write_to_file>"
				const tool = parse(message).find((block) => block.type === "tool_use") as ToolUse

				expect(tool.name).to.equal("write_to_file")
				expect(tool.partial).to.equal(false)
				expect(tool.params.content).to.equal("int main(void) { return 0; }")
			})

			it("leaves a genuinely unterminated call partial", () => {
				// `incompleteToolUse()` must keep firing for the case it was written for — a stream
				// that really did stop mid-call. Recovering a mismatched close must not become
				// recovering an absent one.
				const tool = parse("<write_to_file>\n<path>a.c</path>\n<content>int main(void)").find(
					(block) => block.type === "tool_use",
				) as ToolUse

				expect(tool.partial).to.equal(true)
			})

			it("accepts a closer that is not a tool name at all", () => {
				// ⚠️ Found by the protocol harness, not by review. The first version of this fix
				// accepted only `</known_tool>`, which covered the reported `</read_file>` and left
				// `</function>` — the Anthropic function-call convention's closer, which this model
				// reaches for — still failing. Enumerating the closers a model might invent is a
				// losing game; the position is what identifies a close, not the name.
				const message = "<execute_command>\n<command>gcc -Wall -c fixed.c</command>\n</function>"
				const tool = parse(message).find((block) => block.type === "tool_use") as ToolUse

				expect(tool.name).to.equal("execute_command")
				expect(tool.partial).to.equal(false)
				expect(tool.params.command).to.equal("gcc -Wall -c fixed.c")
			})

			it("writes a file whose content mentions <function_calls>", () => {
				// ⚠️ V3 only, and it destroyed the file. The function-call branch is tested first in
				// the loop and was guarded only against re-entry, so the literal string inside a
				// `<content>` value flipped the parser into function-call mode mid-value; the tool use
				// never closed and was discarded, with the model told its response had been cut off.
				//
				// Asking this extension to write documentation about tool calling therefore destroyed
				// the document — for next-gen model families and no others. Found by the protocol
				// harness reporting a V2/V3 disagreement on a live answer, which is why it runs both.
				const message =
					"<write_to_file>\n<path>docs.md</path>\n" +
					"<content>Wrap calls in <function_calls> when using that API.</content>\n" +
					"</write_to_file>"
				const tool = parse(message).find((block) => block.type === "tool_use") as ToolUse

				expect(tool.name).to.equal("write_to_file")
				expect(tool.partial).to.equal(false)
				expect(tool.params.content).to.contain("<function_calls>")
			})

			it("closes a scalar parameter on the function-call dialect's closer", () => {
				// ⚠️ Observed live. Asked about a coding standard it had never been told about, the
				// model reached for the browser and mixed Anthropic's `<parameter>` dialect into an XML
				// call. `action` then swallowed the rest and came out as a value no executor could use,
				// so the call failed for a missing parameter that had in fact been supplied.
				//
				// The tolerance existed but only for `write_to_file`'s `content`, which is not where
				// dialect mixing happens — it is a property of the model, not of one tool.
				const message =
					"<browser_action>\n<action>go_to_url\n</parameter>\n<parameter>\nurl\n" +
					"https://example.invalid\n</parameter>\n</action>\n</browser_action>"
				const tool = parse(message).find((block) => block.type === "tool_use") as ToolUse

				expect(tool.name).to.equal("browser_action")
				expect(tool.params.action).to.equal("go_to_url")
			})

			it("keeps a free-text parameter that legitimately contains the literal", () => {
				// The other half, and why the tolerance cannot simply close on the first `</parameter>`
				// everywhere: `content` and `diff` carry arbitrary text, so the literal may be the file
				// rather than a mis-closed tag. Those defer until their own closing tag is shown to be
				// absent; short scalars do not.
				const message =
					"<write_to_file>\n<path>docs.md</path>\n" +
					"<content>Close it with </parameter> when using that API.</content>\n</write_to_file>"
				const tool = parse(message).find((block) => block.type === "tool_use") as ToolUse

				expect(tool.params.content).to.contain("</parameter>")
				expect(tool.params.path).to.equal("docs.md")
			})

			it("does not close a call on a tag written inside a parameter value", () => {
				// Content is read as a value until `</content>`, so text that happens to contain a
				// closing tag — writing documentation about the tools, say — is just text.
				const message =
					"<write_to_file>\n" +
					"<path>docs.md</path>\n" +
					"<content>Finish the call with </read_file> when reading.</content>\n" +
					"</write_to_file>"
				const tool = parse(message).find((block) => block.type === "tool_use") as ToolUse

				expect(tool.params.content).to.contain("</read_file>")
				expect(tool.params.path).to.equal("docs.md")
			})
		})
	}
})
