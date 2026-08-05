import { expect } from "chai"
import { describe, it } from "mocha"

/**
 * An error event in the stream must not read as an empty answer.
 *
 * ⚠️ The chain that produced *"Unexpected API Response: The language model did not provide any
 * assistant messages"* for a user who had simply run out of daily requests:
 *
 * the backend answered a streaming refusal by writing one SSE event carrying `error` and nothing
 * else → that event has no `choices`, so the provider's parse found no delta and yielded nothing →
 * with no text in the whole stream the turn ended with an empty assistant message → the task loop
 * concluded the model had returned nothing and said so.
 *
 * Every hop was locally reasonable and the result blamed the model for a billing state, with no
 * remedy in the message and nothing pointing at the real cause.
 *
 * This pins the decision the provider makes about such an event. The provider module itself reaches
 * `vscode` through the account service and cannot be loaded here, so the predicate is expressed
 * where it can be tested — the same reason `truncationChunkFor` lives in the transform layer.
 */

/** The shape the provider branches on, kept in step with `aeriocode.ts`. */
function upstreamFailureFrom(parsed: { error?: unknown }): (Error & { status?: number; isUpstreamFailure?: boolean }) | null {
	if (!parsed.error) {
		return null
	}
	const raw = parsed.error as { message?: string; status?: number } | string
	const message = typeof raw === "string" ? raw : raw.message || "Upstream error"
	const failure = new Error(message) as Error & { status?: number; isUpstreamFailure?: boolean }
	failure.isUpstreamFailure = true
	if (typeof raw === "object" && raw.status) {
		failure.status = raw.status
	}
	return failure
}

describe("an error event in the completion stream", () => {
	it("becomes a failure carrying the upstream status", () => {
		const failure = upstreamFailureFrom({ error: { message: "Daily rate limit exceeded", status: 429, type: "rate_limit" } })

		expect(failure).to.not.be.null
		expect(failure!.status).to.equal(429)
		expect(failure!.message).to.equal("Daily rate limit exceeded")
	})

	it("is tagged, so the catch that ignores malformed chunks does not swallow it too", () => {
		// The provider parses each event inside a try whose catch exists to tolerate a truncated or
		// malformed chunk. Without the tag that catch discards this failure as well, and reporting it
		// is exactly as silent as never having reported it.
		expect(upstreamFailureFrom({ error: "boom" })!.isUpstreamFailure).to.equal(true)
	})

	it("handles a bare string error, which older backends send", () => {
		expect(upstreamFailureFrom({ error: "Something went wrong" })!.message).to.equal("Something went wrong")
	})

	it("says nothing about an ordinary completion chunk", () => {
		expect(upstreamFailureFrom({ choices: [{ delta: { content: "int main" } }] } as never)).to.be.null
	})
})
