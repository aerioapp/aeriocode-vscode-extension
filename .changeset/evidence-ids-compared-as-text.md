---
"Aerio-Code": patch
---

Fix the two places a user id's JavaScript type silently disabled the evidence trail.

`user_id` is a TEXT column, so Postgres hands back `"6"`. `req.user.id` is a **number** whenever the
SSO's by-id lookup resolves the account and a **string** when the middleware falls back to the
response header — the same user arrives in two shapes depending on which path ran. Both bugs below
are that mismatch, and both were found by exercising the API against a real database rather than a
fake pool.

**Every project-scoped request 404'd.** The ownership check compared with `!==`, so the insert
succeeded — Postgres coerces on the way in — and every read afterwards failed. A project registered
successfully and was then reported as not existing on the very next call. It read as a permissions
problem, which is the wrong place to look.

**No chain could ever verify.** An entry is sealed from whatever the caller had in hand and verified
from what the database returns, and `canonicalize({userId: 6})` is not `canonicalize({userId: "6"})`.
⚠️ What let this survive is that the symptom is indistinguishable from success: `valid: false,
brokenAtSeq: 1` is exactly what a genuinely tampered trail produces, so the integrity check appeared
to be working and reporting a real problem. It was reporting itself.

Identifier fields are now normalised to text inside `hashableEntry`, so the canonical form of an
entry cannot depend on which path through the auth middleware ran. Ownership is compared the same
way, with null and undefined never equal to anything so an unauthenticated caller cannot match a
project whose owner coerces to the same string.

⚠️ **Entries written before this fix keep their old hashes and will not verify.** There is no
migration for that and none is possible — the stored hash commits to the bytes it was sealed from.
Since verification never passed for these users, nothing that previously worked is lost.
