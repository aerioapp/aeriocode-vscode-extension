import type { RequirementRow, TraceabilityLinkRow } from "./types"

/**
 * Traceability status in both directions, computed once and read everywhere.
 *
 * ⚠️ **Three places used to answer this question and two of them answered it wrong.** The matrix
 * controller reported a per-requirement `coverage_percent` of 100 for any requirement carrying a
 * link of any kind — a design document and no code read as fully covered. `TraceabilityChecker`
 * reported `totalFunctions` and `tracedFunctions` as the same value, so function coverage read 100%
 * whatever the project looked like. Both were corrected; the correction was then written twice,
 * independently, which is the same defect one round later.
 *
 * ⚠️ **And the third was worse, because it reached the enforcement gate.** `getLinkCounts()` returns
 * `COUNT(DISTINCT artifact_path)` — a count of *files* — and `CertificationManager.getStatus` divided
 * it by the number of *requirements*. One requirement linked to five files reported 500% traced, and
 * that number was passed to `calculateEnforcement` as `tracedCount`, where the pass condition is
 * `>= 100`. A programme with one requirement and five linked files was told its traceability
 * objective was met. Units, not rounding: the numerator and the denominator counted different things.
 *
 * So there is one function, it is pure, and the callers hold no arithmetic of their own.
 *
 * ## What the two directions are
 *
 * DO-178C 11.21 requires the associations to be **bi-directional**, and the directions answer
 * different questions. Requirement → code asks whether everything required was built (Table A-4
 * objective 6, Table A-5 objective 5). Code → requirement asks whether everything built was
 * required. A programme can be complete in one and empty in the other, so they are never averaged.
 *
 * ⚠️ There is deliberately no percentage per requirement and no aggregate score. A requirement is
 * implemented or it is not; a single number would average "every requirement implemented, none
 * verified" into something reassuring.
 */
export interface TraceabilitySummary {
	requirements: number
	/** Requirements with at least one `source_code` link. */
	implemented: number
	unimplementedRequirementIds: string[]
	/** Requirements with at least one `test_case` or `test_result` link. */
	verified: number
	unverifiedRequirementIds: string[]
	/**
	 * Requirement ids named by a link that the baseline does not contain — the requirement was
	 * removed or the tag is wrong, and both need someone to look.
	 *
	 * ⚠️ Code carrying *no* tag is not reported. Aerio cannot tell code that implements nothing from
	 * code nobody annotated, and reporting the latter as unintended functionality would accuse a
	 * programme of something this data does not show.
	 */
	orphanedTagRequirementIds: string[]
}

/** Artifact types that evidence requirement → code. */
const IMPLEMENTING_ARTIFACTS = new Set(["source_code"])

/** Artifact types that evidence requirement → test. */
const VERIFYING_ARTIFACTS = new Set(["test_case", "test_result"])

/**
 * Group links by requirement id.
 *
 * ⚠️ A map rather than `links.filter(...)` inside `requirements.map(...)`, which is what both
 * previous copies did. That is O(requirements × links), and a certification baseline is exactly the
 * shape that makes it hurt: a real programme carries thousands of each, and the matrix is rendered
 * on every panel open.
 */
export function linksByRequirement(links: readonly TraceabilityLinkRow[]): Map<string, TraceabilityLinkRow[]> {
	const grouped = new Map<string, TraceabilityLinkRow[]>()
	for (const link of links) {
		const existing = grouped.get(link.requirement_id)
		if (existing) {
			existing.push(link)
		} else {
			grouped.set(link.requirement_id, [link])
		}
	}
	return grouped
}

/** Whether a requirement's links evidence implementing code. */
export function isImplemented(links: readonly TraceabilityLinkRow[] | undefined): boolean {
	return (links ?? []).some((link) => IMPLEMENTING_ARTIFACTS.has(link.artifact_type))
}

/** Whether a requirement's links evidence a test. */
export function isVerified(links: readonly TraceabilityLinkRow[] | undefined): boolean {
	return (links ?? []).some((link) => VERIFYING_ARTIFACTS.has(link.artifact_type))
}

/** Artifact paths of a requirement's links of one type, in the order the database returned them. */
export function pathsOfType(links: readonly TraceabilityLinkRow[] | undefined, type: "source_code" | "document"): string[] {
	return (links ?? []).filter((link) => link.artifact_type === type).map((link) => link.artifact_path || "")
}

/** Artifact paths of a requirement's test links. */
export function testPaths(links: readonly TraceabilityLinkRow[] | undefined): string[] {
	return (links ?? []).filter((link) => VERIFYING_ARTIFACTS.has(link.artifact_type)).map((link) => link.artifact_path || "")
}

/**
 * Both traceability directions for a requirement baseline.
 *
 * Pure, so the tests exercise the same code the status bar, the matrix and the enforcement gate do
 * rather than a copy of it.
 */
export function summariseTraceability(
	requirements: readonly RequirementRow[],
	links: readonly TraceabilityLinkRow[],
): TraceabilitySummary {
	const grouped = linksByRequirement(links)
	const known = new Set(requirements.map((requirement) => requirement.requirement_id))

	const unimplementedRequirementIds: string[] = []
	const unverifiedRequirementIds: string[] = []
	for (const requirement of requirements) {
		const forRequirement = grouped.get(requirement.requirement_id)
		if (!isImplemented(forRequirement)) {
			unimplementedRequirementIds.push(requirement.requirement_id)
		}
		if (!isVerified(forRequirement)) {
			unverifiedRequirementIds.push(requirement.requirement_id)
		}
	}

	const orphanedTagRequirementIds = [...new Set(links.map((link) => link.requirement_id).filter((id) => !known.has(id)))]

	return {
		requirements: requirements.length,
		implemented: requirements.length - unimplementedRequirementIds.length,
		unimplementedRequirementIds,
		verified: requirements.length - unverifiedRequirementIds.length,
		unverifiedRequirementIds,
		orphanedTagRequirementIds,
	}
}
