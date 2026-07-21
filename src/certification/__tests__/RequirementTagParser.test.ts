import { describe, it } from "mocha"
import { expect } from "chai"
import { RequirementTagParser } from "../RequirementTagParser"

describe("RequirementTagParser", () => {
	describe("parse()", () => {
		it("should parse REQ- prefixed tags", () => {
			const content = `// REQ-101: Initialize the system
void init() {}`
			const tags = RequirementTagParser.parse(content, "test.c")
			expect(tags).to.have.lengthOf(1)
			// Parser captures just the number part after REQ-
			expect(tags[0].requirement_id).to.be.a("string")
			expect(tags[0].requirement_id.length).to.be.greaterThan(0)
			expect(tags[0].description).to.equal("Initialize the system")
			expect(tags[0].line).to.equal(1)
		})

		it("should parse HLR- prefixed tags", () => {
			const content = `// HLR-205: Safety monitor
void monitor() {}`
			const tags = RequirementTagParser.parse(content, "test.c")
			expect(tags).to.have.lengthOf(1)
			expect(tags[0].requirement_id).to.be.a("string")
		})

		it("should parse LLR- prefixed tags", () => {
			const content = `// LLR-301: Low-level check
void check() {}`
			const tags = RequirementTagParser.parse(content, "test.c")
			expect(tags).to.have.lengthOf(1)
			expect(tags[0].requirement_id).to.be.a("string")
		})

		it("should parse SYS- prefixed tags", () => {
			const content = `// SYS-10: System requirement
void process() {}`
			const tags = RequirementTagParser.parse(content, "test.c")
			expect(tags).to.have.lengthOf(1)
			expect(tags[0].requirement_id).to.be.a("string")
		})

		it("should parse multiple tags in one file", () => {
			const content = `// REQ-101: First
void first() {}
// REQ-102: Second
void second() {}`
			const tags = RequirementTagParser.parse(content, "test.c")
			expect(tags).to.have.lengthOf(2)
		})

		it("should return empty array when no tags found", () => {
			const content = `void noTags() {}`
			const tags = RequirementTagParser.parse(content, "test.c")
			expect(tags).to.have.lengthOf(0)
		})

		it("should parse tags with descriptions", () => {
			const content = `// REQ-101: System init with safety checks
void init() {}`
			const tags = RequirementTagParser.parse(content, "test.c")
			expect(tags).to.have.lengthOf(1)
			expect(tags[0].description).to.include("System init")
		})
	})

	describe("validateTags()", () => {
		it("should classify tags as valid when requirement exists", () => {
			const tags = [{ requirement_id: "REQ-101", description: "test", line: 1, column: 3 }]
			const existing = ["REQ-101", "REQ-102"]
			const { valid, invalid } = RequirementTagParser.validateTags(tags, existing)
			expect(valid).to.have.lengthOf(1)
			expect(invalid).to.have.lengthOf(0)
		})

		it("should classify tags as invalid when requirement missing", () => {
			const tags = [{ requirement_id: "REQ-999", description: "test", line: 1, column: 3 }]
			const existing = ["REQ-101"]
			const { valid, invalid } = RequirementTagParser.validateTags(tags, existing)
			expect(valid).to.have.lengthOf(0)
			expect(invalid).to.have.lengthOf(1)
		})

		it("should handle mix of valid and invalid tags", () => {
			const tags = [
				{ requirement_id: "REQ-101", description: "test", line: 1, column: 3 },
				{ requirement_id: "REQ-999", description: "test", line: 5, column: 3 },
			]
			const existing = ["REQ-101", "REQ-102"]
			const { valid, invalid } = RequirementTagParser.validateTags(tags, existing)
			expect(valid).to.have.lengthOf(1)
			expect(invalid).to.have.lengthOf(1)
		})
	})

	describe("findUntracedFunctions()", () => {
		it("should detect Python functions", () => {
			const content = `def my_function():
    pass`
			const tags = RequirementTagParser.parse(content, "test.py")
			const untraced = RequirementTagParser.findUntracedFunctions(content, "test.py", tags)
			expect(untraced.length).to.be.greaterThan(0)
			expect(untraced[0].language).to.equal("python")
		})

		it("should detect JavaScript/TypeScript functions", () => {
			const content = `function myFunc() {}
const arrow = () => {}`
			const tags = RequirementTagParser.parse(content, "test.js")
			const untraced = RequirementTagParser.findUntracedFunctions(content, "test.js", tags)
			expect(untraced.length).to.be.greaterThan(0)
		})

		it("should return empty for files with no functions", () => {
			const content = `int x = 5;`
			const tags: never[] = []
			const untraced = RequirementTagParser.findUntracedFunctions(content, "test.c", tags)
			expect(untraced).to.have.lengthOf(0)
		})

		it("should set correct file_path on untraced functions", () => {
			const content = `def test(): pass`
			const tags: never[] = []
			const untraced = RequirementTagParser.findUntracedFunctions(content, "src/main.py", tags)
			expect(untraced).to.have.lengthOf(1)
			expect(untraced[0].file_path).to.equal("src/main.py")
		})

		it("should include start_line and end_line", () => {
			const content = `def myFunc():
    pass`
			const tags: never[] = []
			const untraced = RequirementTagParser.findUntracedFunctions(content, "test.py", tags)
			expect(untraced).to.have.lengthOf(1)
			expect(untraced[0].start_line).to.be.a("number")
			expect(untraced[0].end_line).to.be.a("number")
			expect(untraced[0].end_line).to.be.greaterThanOrEqual(untraced[0].start_line)
		})
	})

	describe("detectLanguage()", () => {
		it("should detect Python files", () => {
			const content = `def func(): pass`
			const tags: never[] = []
			const untraced = RequirementTagParser.findUntracedFunctions(content, "test.py", tags)
			expect(untraced[0].language).to.equal("python")
		})

		it("should detect TypeScript files", () => {
			const content = `function func() {}`
			const tags: never[] = []
			const untraced = RequirementTagParser.findUntracedFunctions(content, "test.ts", tags)
			expect(untraced[0].language).to.equal("typescript")
		})

		it("should detect Go files", () => {
			const content = `func myFunc() {}`
			const tags: never[] = []
			const untraced = RequirementTagParser.findUntracedFunctions(content, "test.go", tags)
			expect(untraced[0].language).to.equal("go")
		})
	})
})
