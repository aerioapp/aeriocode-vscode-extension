---
"Aerio-Code": minor
---

Withdraw the MISRA C and MISRA C++ rule packs.

`misra-c` and `misra-cpp` are no longer values of `aeriocode.compliance.standard`, and the backend
answers a request for either with a 404 that says why rather than the generic "unknown standard".

They were authored from recollection: 307 guidelines whose analysis was sound and whose *numbers*
nobody could confirm, cited to the user as provisional. Confirming them means reading a licensed copy
of the document, and MISRA's licence names validating an AI tool against it as a prohibited use — so
the diligent act was the one that would have created the breach, and the numbers could never stop
being provisional.

**A workspace with either selected loses a rule number, not analysis.** The checks still run:
`aerio-scs` adopts them and reports the findings under rule ids Aerio authored. The setting is not
rewritten and the value is not silently dropped — the 404 names the pack, says it was withdrawn, and
points at the standard now carrying its checks. A programme that holds a MISRA licence maps Aerio's
rule ids onto its own copy, inside its own licence, which is the only place that mapping may live.

This is recorded separately from the regime work because it is a different decision with a different
reason, and a reader looking for why a standard they had selected disappeared should not have to find
it inside a note about NASA classifications.
