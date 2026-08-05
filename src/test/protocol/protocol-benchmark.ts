/**
 * Does the model produce tool calls this extension can actually execute?
 *
 *     AERIO_BENCH_TOKEN=<session> npx mocha --spec src/test/protocol/protocol-benchmark.ts
 *
 * ## Why this exists next to the prompt benchmark rather than inside it
 *
 * `Backend/scripts/benchmark-prompt.js` measures whether generated code satisfies a coding
 * standard. To do that it **reimplements** the agent loop — its own extraction, its own
 * "you did not use a tool" message, its own mistake budget — because it runs in a different repo
 * from the extension and cannot import it.
 *
 * ⚠️ That reimplementation is why five measurement passes missed two defects that broke a real user
 * on their first task. The harness read `<content>…</content>` with a regex, so it accepted a call
 * closed by the wrong tool's tag and a call under an invented tool name; the extension's parser
 * rejected both. The instrument was **more permissive than the product**, which is the one direction
 * of error that never looks wrong in the numbers — a stricter instrument understates a score
 * visibly, a looser one reports a capability the product does not have.
 *
 * So this harness inverts the trade. It measures nothing about coding standards and everything
 * about the protocol, and it does so by feeding raw model output through
 * {@link parseAssistantMessageV2} and {@link parseAssistantMessageV3} — **the functions the product
 * runs**. It cannot drift from the product, because it *is* the product's parser.
 *
 * ## What it measures
 *
 * Every outcome other than `ok` is one wasted round trip: the user watches a turn happen, nothing
 * lands, and the model is re-prompted. That is the direct measure of "least interruptions", and it
 * is not visible anywhere in the rule-compliance numbers.
 *
 * Both parsers are exercised on every answer. `parseAssistantMessageV3` is selected for next-gen
 * model families and V2 for everything else, and a divergence between them means half the models
 * behave differently — which is exactly how the mismatched-close defect survived, duplicated
 * verbatim in both.
 */

import { parseAssistantMessageV2, parseAssistantMessageV3, ToolUse, ToolUseName } from "@core/assistant-message"
import { detectMalformedToolUse } from "@core/prompts/responses"
import { describe, it } from "mocha"

const BASE = process.env.AERIO_BENCH_BASE || "http://127.0.0.1:29030"
const TOKEN = process.env.AERIO_BENCH_TOKEN
const STANDARD = process.env.AERIO_BENCH_STANDARD || "aerio-scs"
const LEVEL = process.env.AERIO_BENCH_LEVEL || "A"
const RUNS = Number(process.env.AERIO_BENCH_RUNS) || 1

/** `src/api/providers/aeriocode.ts` — what the extension actually asks for. */
const MAX_TOKENS = 32000

/**
 * The parameter each tool cannot execute without.
 *
 * Mirrors the guards at `ToolExecutor.ts:700`, `:707` and `:714`. A call that parses but omits one
 * of these is *not* a success — the executor answers `missingToolParameterError` and the turn is
 * spent — so counting it as a parsed tool use would reproduce the exact over-crediting this file
 * was written to remove.
 */
const REQUIRED_PARAMETERS: Partial<Record<ToolUseName, string[]>> = {
	read_file: ["path"],
	write_to_file: ["path", "content"],
	replace_in_file: ["path", "diff"],
	search_files: ["path", "regex"],
	execute_command: ["command"],
	attempt_completion: ["result"],
}

/**
 * Tasks chosen to provoke the protocol rather than the standard.
 *
 * Weighted towards editing an existing file, because that is where the failures concentrated: the
 * `replace_in_file` defect made every edit uncallable, and the user session that found the other
 * two was an ordinary "write me a file" that turned into an edit after the first attempt failed.
 */
const SEED = `/*
 * Fixed-point helpers for the attitude loop.
 */
#include <stdint.h>

int32_t clamp_i32(int32_t value, int32_t lo, int32_t hi)
{
    int32_t result = value;
    if (result < lo) { result = lo; }
    if (result > hi) { result = hi; }
    return result;
}
`

const TASKS: Array<{ name: string; ask: string; seed?: string }> = [
	{ name: "write a new file", ask: "Write a C file bench.c with a function that computes a CRC-8 over a byte buffer." },
	{
		name: "edit: add a function",
		ask: "Add a function `scale_i32` to fixed.c that multiplies by a numerator and divides by a denominator.",
		seed: SEED,
	},
	{
		name: "edit: change a constant",
		ask: "In fixed.c, make clamp_i32 return the midpoint when lo is greater than hi.",
		seed: SEED,
	},
	{
		name: "edit: add a guard",
		ask: "In fixed.c, add a bounds assertion to clamp_i32 before it does anything else.",
		seed: SEED,
	},
	{ name: "read then act", ask: "Read fixed.c and tell me whether clamp_i32 handles lo > hi, then fix it if not.", seed: SEED },
	{ name: "run a command", ask: "Compile fixed.c with gcc and report whether it builds cleanly.", seed: SEED },
]

interface Outcome {
	kind: "ok" | "missing-parameter" | "invalid-tool-name" | "unterminated" | "no-tool-call"
	tool?: string
	detail?: string
}

/**
 * What the product would do with this answer — decided by the product's own parser.
 *
 * Order matters and follows `task/index.ts`: a parsed, complete tool use with its required
 * parameters is the only outcome that costs the user nothing.
 */
function classify(answer: string, parse: (message: string) => ReturnType<typeof parseAssistantMessageV2>): Outcome {
	const blocks = parse(answer)
	const tools = blocks.filter((block): block is ToolUse => block.type === "tool_use")
	const complete = tools.find((tool) => !tool.partial)

	if (complete) {
		const required = REQUIRED_PARAMETERS[complete.name] || []
		const missing = required.filter((param) => !complete.params[param as keyof typeof complete.params])
		if (missing.length > 0) {
			return { kind: "missing-parameter", tool: complete.name, detail: missing.join(", ") }
		}
		return { kind: "ok", tool: complete.name }
	}

	if (tools.length > 0) {
		// Opened and never closed. Dropped at end of stream; the model is asked to retry.
		return { kind: "unterminated", tool: tools[0].name }
	}

	const malformed = detectMalformedToolUse(answer)
	if (malformed) {
		return { kind: "invalid-tool-name", detail: malformed.tag, tool: malformed.suggestedTool }
	}

	return { kind: "no-tool-call" }
}

async function complete(ask: string, seed?: string): Promise<{ answer: string; finish: string }> {
	const messages: Array<{ role: string; content: string }> = []
	if (seed) {
		messages.push({ role: "user", content: `<task>\n${ask}\n</task>` })
		messages.push({ role: "assistant", content: "<read_file>\n<path>fixed.c</path>\n</read_file>" })
		messages.push({ role: "user", content: `[read_file for 'fixed.c'] Result:\n${seed}\n\nProceed.` })
	} else {
		messages.push({ role: "user", content: `<task>\n${ask}\n</task>` })
	}

	const response = await fetch(`${BASE}/api/v1/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
		body: JSON.stringify({
			messages,
			model: "AerioCode",
			stream: false,
			max_tokens: MAX_TOKENS,
			temperature: 0.2,
			context: {
				cwd: "/workspace",
				osName: "linux",
				shell: "bash",
				homeDir: "/home/dev",
				complianceProfile: { standard: STANDARD, level: LEVEL, regime: "do-178c", language: "c" },
			},
		}),
	})

	if (!response.ok) {
		throw new Error(`completion ${response.status}`)
	}
	const body: any = await response.json()
	return { answer: body.choices[0].message.content, finish: body.choices[0].finish_reason }
}

describe("tool protocol conformance against the live backend", function () {
	this.timeout(20 * 60 * 1000)

	// Not a unit test and must never fail a build for want of a running cluster. It is an
	// instrument: it reports, and a person reads the report.
	before(function () {
		if (!TOKEN) {
			console.log("\n  AERIO_BENCH_TOKEN unset — skipping. This harness needs a live backend.\n")
			this.skip()
		}
	})

	it("reports the round trips a user would lose to the protocol", async () => {
		const tally: Record<string, number> = {}
		const divergences: string[] = []
		const failures: string[] = []
		let samples = 0

		for (let run = 1; run <= RUNS; run++) {
			for (const task of TASKS) {
				let answer: string
				let finish: string
				try {
					;({ answer, finish } = await complete(task.ask, task.seed))
				} catch (error) {
					failures.push(`${task.name}: ${(error as Error).message}`)
					continue
				}
				samples++

				const v2 = classify(answer, parseAssistantMessageV2)
				const v3 = classify(answer, parseAssistantMessageV3)

				// A parser disagreement means the outcome depends on which model family the user
				// happens to be on, which is how the mismatched-close defect stayed invisible.
				if (v2.kind !== v3.kind) {
					// ⚠️ The answer, in full, because a divergence cannot be reproduced from its name.
					// The first one this harness reported — V2 ok, V3 unterminated — could not be
					// reconstructed afterwards from any synthetic shape, and was lost. A category
					// without its evidence is the failure mode this whole programme keeps rediscovering.
					divergences.push(`${task.name}: V2 ${v2.kind} vs V3 ${v3.kind}\n---8<---\n${answer}\n--->8---`)
				}

				const label = v2.tool ? `${v2.kind} (${v2.tool}${v2.detail ? `: ${v2.detail}` : ""})` : v2.kind
				tally[v2.kind] = (tally[v2.kind] || 0) + 1
				console.log(
					`  run ${run}  ${task.name.padEnd(24)} ${label.padEnd(38)} ${finish}${finish === "length" ? "  ⚠ truncated" : ""}`,
				)

				// The tail of a failing answer, because a category with no example attached is what
				// let "no file emitted" survive three rounds of prompt changes in the other harness.
				// The tail rather than the head: the malformation is at the end of the call.
				if (v2.kind !== "ok") {
					console.log(`      …${answer.slice(-260).replace(/\n/g, "\n      ")}`)
				}
			}
		}

		const ok = tally.ok || 0
		const lost = samples - ok
		console.log(`\n  === protocol conformance: ${ok}/${samples} first turns executable ===`)
		for (const [kind, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
			console.log(`    ${kind.padEnd(20)} ${count}`)
		}
		console.log(`\n  round trips lost to the protocol: ${lost}/${samples}`)
		console.log(`  parser divergences (V2 vs V3): ${divergences.length}`)
		divergences.forEach((line) => console.log(`    ${line}`))
		if (failures.length > 0) {
			console.log(`  requests that never completed: ${failures.length}`)
			failures.forEach((line) => console.log(`    ${line}`))
		}
	})
})
