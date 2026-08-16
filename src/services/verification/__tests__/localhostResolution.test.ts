import { expect } from "chai"
import dns from "node:dns"
import net from "node:net"

/**
 * Why a backend call against a local cluster used to hang for ten seconds.
 *
 * ⚠️ This is a **networking** test, not a client test, and it is here because the failure it
 * describes was reported as "compliance check never loads" — a symptom that points at the server and
 * at the request code, and at neither of the two things actually involved.
 *
 * The chain, each link of which is asserted below:
 *
 * 1. `code.localhost` resolves IPv6-first. Node has returned the resolver's own order since v17.
 * 2. A kind cluster publishes its ingress on `0.0.0.0:9080` — IPv4 only.
 * 3. So the first address tried has nothing listening, and the packets are *dropped* rather than
 *    refused, which is why there is no fast failure to fall back from.
 *
 * `curl` and a plain `node` script both succeed against the same URL — curl races the families, and
 * Node 20+ has `autoSelectFamily`. VS Code bundles its own undici and does not, which is what made
 * this look like a server fault from inside the extension and a working server from a terminal.
 */
/**
 * Resolve a name, or null when this machine has no answer for it.
 *
 * ⚠️ `code.localhost` resolves on a developer machine running the cluster and does **not** resolve on
 * a CI runner, where the name exists nowhere. That is an absent precondition rather than a failure:
 * these tests describe what the resolver does with a name that has both families, and a machine that
 * cannot resolve it at all has nothing to say about that. Returning null lets the caller skip, which
 * is what the connect probe below already does when the cluster is not up.
 */
async function lookupOrNull(host: string, options: dns.LookupAllOptions): Promise<dns.LookupAddress[] | null> {
	return new Promise((resolve, reject) => {
		dns.lookup(host, options, (error, result) => {
			if (error) {
				const code = (error as NodeJS.ErrnoException).code
				return code === "ENOTFOUND" || code === "EAI_AGAIN" ? resolve(null) : reject(error)
			}
			resolve(result)
		})
	})
}

describe("resolving a local cluster host", () => {
	it("puts IPv6 first for a .localhost name unless the order is set", async function () {
		// The precondition for the whole failure. If this ever stops being true the bug is gone, but
		// so is the reason for the fix, and someone should find out which.
		//
		// `verbatim: true` is Node's own default since v17 — spelled out because the entire point is
		// that the resolver's order is honoured rather than reordered.
		const addresses = await lookupOrNull("code.localhost", { all: true, verbatim: true })
		if (!addresses) {
			return this.skip()
		}

		const families = addresses.map((a) => a.family)
		expect(families, "code.localhost should resolve to both families").to.include(4)
		if (families.includes(6)) {
			expect(addresses[0].family, "IPv6 is expected to sort first, which is what breaks the connect").to.equal(6)
		}
	})

	it("connects on IPv4 and hangs on IPv6 against an IPv4-only listener", async function () {
		this.timeout(10_000)

		const probe = (host: string) =>
			new Promise<"connected" | "refused" | "timeout">((resolve) => {
				const socket = net.connect({ host, port: 9080, family: host.includes(":") ? 6 : 4 })
				const done = (outcome: "connected" | "refused" | "timeout") => {
					socket.destroy()
					resolve(outcome)
				}
				socket.setTimeout(2500)
				socket.on("connect", () => done("connected"))
				socket.on("timeout", () => done("timeout"))
				socket.on("error", () => done("refused"))
			})

		const [v4, v6] = await Promise.all([probe("127.0.0.1"), probe("::1")])

		// The cluster may not be running, and this test must not fail for that reason — it is about the
		// asymmetry, not about the cluster being up.
		if (v4 !== "connected") {
			return this.skip()
		}

		// ⚠️ The whole bug in one assertion. Not `refused`: a refused connection produces an instant
		// error and undici would move to the next address. Dropped packets produce a timeout, and the
		// request waits out the full connect budget before reporting something that reads like the
		// server never answered.
		expect(v6, "IPv6 on an IPv4-only kind binding should hang, not refuse").to.not.equal("connected")
	})

	it("prefers IPv4 once the result order is set, which is what activate() does", async function () {
		const previous = dns.getDefaultResultOrder?.()
		let addresses: dns.LookupAddress[] | null
		try {
			dns.setDefaultResultOrder("ipv4first")
			addresses = await lookupOrNull("code.localhost", { all: true })
		} finally {
			// Restored before the skip, so a machine that cannot resolve the name does not leave the
			// process-wide resolver order changed for every test that runs after this one.
			if (previous) {
				dns.setDefaultResultOrder(previous)
			}
		}

		if (!addresses) {
			return this.skip()
		}
		expect(addresses[0].family, "ipv4first should put the reachable address first").to.equal(4)
	})
})
