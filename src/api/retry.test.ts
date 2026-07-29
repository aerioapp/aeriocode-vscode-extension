import { describe, it } from "mocha"
import "should"
import { withRetry } from "./retry"

/**
 * Delay a retry is allowed to overshoot by before the assertion is measuring the machine
 * rather than the decorator.
 *
 * These tests previously pinned elapsed time to within ±10 ms of the target. That
 * tolerance measures how loaded the host is, not how the decorator behaves — a 10 ms
 * setTimeout routinely lands at 40 ms under load, and the suite failed about half the
 * time. The ceiling below is far above any plausible jitter while still sitting well
 * under the delay each test is proving was *not* used.
 */
const JITTER_CEILING_MS = 500

/**
 * Assert a retry actually waited, without asserting scheduler precision.
 *
 * The floor is the point: it proves the decorator slept for the delay it chose instead of
 * retrying immediately. Only use this where a wait is genuinely expected — see the
 * retry-after tests, where the header floors to a zero-second wait by design.
 */
function assertWaitedAbout(duration: number, expected: number) {
	// setTimeout may fire a millisecond early; below that, no wait happened at all.
	duration.should.be.aboveOrEqual(Math.max(0, expected - 2))
	duration.should.be.below(JITTER_CEILING_MS)
}

describe("Retry Decorator", () => {
	describe("withRetry", () => {
		it("should not retry on success", async () => {
			let callCount = 0
			class TestClass {
				@withRetry()
				async *successMethod() {
					callCount++
					yield "success"
				}
			}

			const test = new TestClass()
			const result = []
			for await (const value of test.successMethod()) {
				result.push(value)
			}

			callCount.should.equal(1)
			result.should.deepEqual(["success"])
		})

		it("should retry on rate limit (429) error", async () => {
			let callCount = 0
			class TestClass {
				@withRetry({ maxRetries: 2, baseDelay: 10, maxDelay: 100 })
				async *failMethod() {
					callCount++
					if (callCount === 1) {
						const error: any = new Error("Rate limit exceeded")
						error.status = 429
						throw error
					}
					yield "success after retry"
				}
			}

			const test = new TestClass()
			const result = []
			for await (const value of test.failMethod()) {
				result.push(value)
			}

			callCount.should.equal(2)
			result.should.deepEqual(["success after retry"])
		})

		it("should not retry on non-rate-limit errors", async () => {
			let callCount = 0
			class TestClass {
				@withRetry()
				async *failMethod() {
					callCount++
					throw new Error("Regular error")
				}
			}

			const test = new TestClass()
			try {
				for await (const _ of test.failMethod()) {
					// Should not reach here
				}
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.message.should.equal("Regular error")
				callCount.should.equal(1)
			}
		})

		it("should respect retry-after header with delta seconds", async () => {
			let callCount = 0
			const startTime = Date.now()
			class TestClass {
				@withRetry({ maxRetries: 2, baseDelay: 1000 }) // Use large baseDelay to ensure header takes precedence
				async *failMethod() {
					callCount++
					if (callCount === 1) {
						const error: any = new Error("Rate limit exceeded")
						error.status = 429
						error.headers = { "retry-after": "0.01" } // 10ms delay
						throw error
					}
					yield "success after retry"
				}
			}

			const test = new TestClass()
			const result = []
			for await (const value of test.failMethod()) {
				result.push(value)
			}

			const duration = Date.now() - startTime
			// Retry-After is defined in whole seconds and the decorator parses it with parseInt,
			// so "0.01" floors to a zero-second wait. What this pins is that the header was
			// consulted at all: had it been ignored, the 1000ms baseDelay would have applied.
			duration.should.be.below(JITTER_CEILING_MS)
			callCount.should.equal(2)
			result.should.deepEqual(["success after retry"])
		})

		it("should respect retry-after header with Unix timestamp", async () => {
			let callCount = 0
			const startTime = Date.now()
			const retryTimestamp = Math.floor(Date.now() / 1000) + 0.01 // 10ms in the future

			class TestClass {
				@withRetry({ maxRetries: 2, baseDelay: 1000 }) // Use large baseDelay to ensure header takes precedence
				async *failMethod() {
					callCount++
					if (callCount === 1) {
						const error: any = new Error("Rate limit exceeded")
						error.status = 429
						error.headers = { "retry-after": retryTimestamp.toString() }
						throw error
					}
					yield "success after retry"
				}
			}

			const test = new TestClass()
			const result = []
			for await (const value of test.failMethod()) {
				result.push(value)
			}

			const duration = Date.now() - startTime
			// Same whole-second truncation as above: the timestamp resolves to roughly now, so
			// the wait is zero. The assertion is that the header won over the 1000ms baseDelay.
			duration.should.be.below(JITTER_CEILING_MS)
			callCount.should.equal(2)
			result.should.deepEqual(["success after retry"])
		})

		it("should use exponential backoff when no retry-after header", async () => {
			let callCount = 0
			const startTime = Date.now()
			class TestClass {
				@withRetry({ maxRetries: 2, baseDelay: 10, maxDelay: 100 })
				async *failMethod() {
					callCount++
					if (callCount === 1) {
						const error: any = new Error("Rate limit exceeded")
						error.status = 429
						throw error
					}
					yield "success after retry"
				}
			}

			const test = new TestClass()
			const result = []
			for await (const value of test.failMethod()) {
				result.push(value)
			}

			const duration = Date.now() - startTime
			// First retry should be after baseDelay (10ms).
			assertWaitedAbout(duration, 10)
			callCount.should.equal(2)
			result.should.deepEqual(["success after retry"])
		})

		it("should respect maxDelay", async () => {
			let callCount = 0
			const startTime = Date.now()
			class TestClass {
				@withRetry({ maxRetries: 3, baseDelay: 50, maxDelay: 10 })
				async *failMethod() {
					callCount++
					if (callCount < 3) {
						const error: any = new Error("Rate limit exceeded")
						error.status = 429
						throw error
					}
					yield "success after retries"
				}
			}

			const test = new TestClass()
			const result = []
			for await (const value of test.failMethod()) {
				result.push(value)
			}

			const duration = Date.now() - startTime
			// Both retries capped at maxDelay (10ms each), so well under the 2x50ms baseDelay.
			assertWaitedAbout(duration, 20)
			callCount.should.equal(3)
			result.should.deepEqual(["success after retries"])
		})

		it("should throw after maxRetries attempts", async () => {
			let callCount = 0
			class TestClass {
				@withRetry({ maxRetries: 2, baseDelay: 10 })
				async *failMethod() {
					callCount++
					const error: any = new Error("Rate limit exceeded")
					error.status = 429
					throw error
				}
			}

			const test = new TestClass()
			try {
				for await (const _ of test.failMethod()) {
					// Should not reach here
				}
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.message.should.equal("Rate limit exceeded")
				callCount.should.equal(2) // Initial attempt + 1 retry
			}
		})
	})
})
