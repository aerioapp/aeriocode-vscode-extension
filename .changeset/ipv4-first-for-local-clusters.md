---
"Aerio-Code": patch
---

Fix every backend call hanging for ten seconds against a local cluster.

A compliance check reported "Aerio did not respond in time" after a ten-second wait, and telemetry
failed alongside it with `ConnectTimeoutError`. Neither the server nor the request code was involved.

1. `code.localhost` resolves to `::1` before `127.0.0.1`. Node has honoured the resolver's own order
   rather than reordering it since v17.
2. A kind cluster publishes its ingress as `0.0.0.0:9080` — IPv4 only. Nothing listens on `[::1]:9080`.
3. Connecting there is not refused, it is **dropped**. There is no fast error to fall back from, so
   the socket waits out undici's full ten-second connect budget and then reports what looks like a
   server that never answered.

What made this hard to see from the outside is that it reproduces nowhere else. `curl` races both
address families, and Node 20+ has `autoSelectFamily` doing the same — so the identical URL succeeds
from a terminal and from a plain `node` script while the extension times out. VS Code bundles its own
undici and does not get that behaviour.

The extension host now sets `dns.setDefaultResultOrder("ipv4first")` at activation. That is what Node
itself defaulted to before v17, it costs nothing against the production hosts, and it is set once for
the process so that axios, `fetch` and the telemetry sender cannot disagree about it.

The three links in the chain are asserted directly rather than through a mocked client — resolution
order, the IPv4/IPv6 asymmetry against the running listener, and that setting the order puts the
reachable address first. The middle test asserts the connection **times out rather than being
refused**, because that distinction is the whole reason the failure was slow instead of instant.
