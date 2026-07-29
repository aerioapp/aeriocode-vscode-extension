/**
 * The number of rules a standard actually defines.
 *
 * A rule catalog is generated from the published standard, and a catalog may carry
 * entries for rule numbers the document itself never defines — gaps in the standard's own
 * numbering. The API keeps those entries so the generated catalog stays auditable against
 * its source, and `GET /:standard/rules` still reports them for anyone assembling a
 * conformance case.
 *
 * They have no place in a coverage sentence, though. Naming a rule the checker "did not
 * evaluate" reads as a gap in Aerio rather than in the document, and the count would not
 * add up against the checked and manual-review figures beside it. Coverage shown to a user
 * or to the model is therefore stated against this number, so the parts sum to the whole.
 */
export function definedRuleCount(rulesAutomated: number, rulesManualReview: number): number {
	return rulesAutomated + rulesManualReview
}
