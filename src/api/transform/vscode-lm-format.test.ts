import { convertToVsCodeLmMessages, convertToAnthropicRole, convertToAnthropicMessage } from "./vscode-lm-format"
import { expect } from "chai"

describe("VSCode Language Model Format", () => {
	it("should return empty array for VSCode messages", () => {
		const result = convertToVsCodeLmMessages()
		expect(result).to.deep.equal([])
	})

	it("should return null for anthropic role conversion", () => {
		const result = convertToAnthropicRole()
		expect(result).to.be.null
	})

	it("should return empty message for anthropic message conversion", () => {
		const result = convertToAnthropicMessage()
		expect(result).to.be.an("object")
		expect(result.type).to.equal("message")
		expect(result.role).to.equal("assistant")
		expect(result.content).to.deep.equal([])
	})
})
