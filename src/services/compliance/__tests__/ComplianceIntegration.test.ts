import { describe, it, before } from "mocha"
import { expect } from "chai"
import { ComplianceClient } from "../ComplianceClient"

/**
 * Integration tests against a real Aeriocode backend.
 *
 * GitHub CI runs `npm run test:unit` with no backend reachable, so every case here is
 * skipped unless AERIOCODE_BACKEND_URL is set. Skipped is not failed: CI stays green
 * while the suite still exists and runs locally against the kind cluster.
 *
 *   AERIOCODE_BACKEND_URL=http://code.localhost:9080 \
 *   AERIOCODE_SESSION_ID=<session_id cookie value> \
 *   npm run test:unit
 *
 * A session token is required because the compliance API is account-gated by design.
 */

const BACKEND_URL = process.env.AERIOCODE_BACKEND_URL
const SESSION_ID = process.env.AERIOCODE_SESSION_ID

const VIOLATING_SOURCE = [
	'#include "sensor.h"',
	"/* Reads a sensor value */",
	"void read_sensor(int a) {",
	"    int x = 0xff;",
	"    if (a) x = 1;",
	"    goto done;",
	"    done: ;",
	"}",
	"",
].join("\n")

describe("compliance backend integration", function () {
	// Network round trips against a local cluster can exceed the default timeout.
	this.timeout(30_000)

	let client: ComplianceClient

	before(function () {
		if (!BACKEND_URL) {
			// eslint-disable-next-line no-console
			console.log("      (skipped: set AERIOCODE_BACKEND_URL to run compliance integration tests)")
			this.skip()
		}
		if (!SESSION_ID) {
			// eslint-disable-next-line no-console
			console.log("      (skipped: set AERIOCODE_SESSION_ID to run compliance integration tests)")
			this.skip()
		}

		client = new ComplianceClient(undefined, BACKEND_URL, async () => SESSION_ID ?? null)
	})

	it("lists jf-avpp among the registered standards", async () => {
		const standards = await client.listStandards()
		const jfavpp = standards.find((standard) => standard.id === "jf-avpp")

		expect(jfavpp, "jf-avpp should be registered on the backend").to.not.equal(undefined)
		expect(jfavpp!.languages).to.include("cpp")
		expect(jfavpp!.rules.automated).to.be.greaterThan(0)
	})

	it("analyzes violating C++ and returns findings with real line numbers", async () => {
		const result = await client.analyze("jf-avpp", [{ path: "sensor.cpp", content: VIOLATING_SOURCE }])

		expect(result.findings.length).to.be.greaterThan(0)
		expect(result.summary.mandatoryClean).to.equal(false)

		const gotoFinding = result.findings.find((f) => f.ruleId === "189")
		expect(gotoFinding, "goto should be reported as AV Rule 189").to.not.equal(undefined)
		expect(gotoFinding!.line).to.equal(6)
	})

	it("reports coverage rather than implying the whole standard was checked", async () => {
		const result = await client.analyze("jf-avpp", [{ path: "a.cpp", content: "void f(){ }\n" }])

		expect(result.summary.coverage.rulesAutomated).to.be.lessThan(result.summary.coverage.rulesInStandard)
		expect(result.summary.coverage.rulesManualReview).to.be.greaterThan(0)
	})

	it("returns a diff from safe-tier autofix without writing anything", async () => {
		const result = await client.autofix("jf-avpp", [{ path: "sensor.cpp", content: VIOLATING_SOURCE }], "safe")

		expect(result.summary.fixesApplied).to.be.greaterThan(0)
		expect(result.files[0].diff).to.contain("---")
		expect(result.files[0].fixed).to.contain("0xFF")
		// goto has no mechanical fix and must survive untouched.
		expect(result.files[0].fixed).to.contain("goto done;")
	})

	it("rejects an unknown standard and names the valid ones", async () => {
		try {
			await client.analyze("not-a-standard", [{ path: "a.cpp", content: "void f(){}" }])
			expect.fail("expected the request to be rejected")
		} catch (error) {
			expect((error as { validStandards?: string[] }).validStandards).to.include("jf-avpp")
		}
	})

	it("refuses an unauthenticated request", async () => {
		const anonymous = new ComplianceClient(undefined, BACKEND_URL, async () => "invalid-session-token")

		try {
			await anonymous.analyze("jf-avpp", [{ path: "a.cpp", content: "void f(){}" }])
			expect.fail("expected the request to be rejected")
		} catch (error) {
			expect((error as Error).message).to.be.a("string")
		}
	})
})
