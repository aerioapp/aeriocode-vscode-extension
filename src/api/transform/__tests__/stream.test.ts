import { expect } from "chai"
import { describe, it } from "mocha"
import { truncationChunkFor } from "../stream"

/**
 * A generation cut off by the output limit must announce itself.
 *
 * The backend hardcoded `finish_reason: "stop"` on the final streaming chunk, so a model that ran
 * out of budget mid-answer was indistinguishable from one that finished. That matters more here
 * than in most tools: at the end of a stream the task loop marks every partial content block
 * complete, so a `write_to_file` whose `<content>` was cut off is executed, and a source file that
 * stops mid-function is saved looking whole. It then analyses, reports findings, and is not the
 * file the model was writing — in a product whose whole claim is that generated code is verifiable.
 */
describe("truncationChunkFor", () => {
	it("reports a stream that ended on the output limit", () => {
		expect(truncationChunkFor({ finish_reason: "length" })).to.deep.equal({ type: "truncated", reason: "length" })
	})

	it("says nothing when the model finished on its own", () => {
		expect(truncationChunkFor({ finish_reason: "stop" })).to.be.null
	})

	it("says nothing for a chunk mid-stream, which carries no reason yet", () => {
		expect(truncationChunkFor({ finish_reason: null })).to.be.null
		expect(truncationChunkFor({})).to.be.null
		expect(truncationChunkFor(undefined)).to.be.null
	})

	it("does not treat a refusal or an error as truncation", () => {
		// Both are non-"stop" endings, and neither means the answer was cut off part-way. The remedy
		// this signal triggers is "write less next turn", which is wrong advice for a refused or
		// failed generation and would send the model into shrinking its output for no reason.
		expect(truncationChunkFor({ finish_reason: "content_filter" })).to.be.null
		expect(truncationChunkFor({ finish_reason: "error" })).to.be.null
	})
})
