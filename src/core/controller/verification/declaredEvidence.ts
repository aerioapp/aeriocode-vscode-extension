import { CertificationManager } from "@/certification"
import type { ProjectDatabase } from "@/certification/db/ProjectDatabase"
import type { DeclaredEvidence } from "@/services/verification/VerificationClient"

/**
 * What this project actually holds, for the regime dashboards to answer against.
 *
 * ⚠️ **Derived from the project database, never hardcoded.** Every regime dashboard is a pure
 * function of the flags it is given — that is what lets a programme ask "what would change if we had
 * trace data" without producing any. It also means a caller that passes `complianceRun: true`
 * unconditionally is not asking the backend a question, it is telling it an answer, and the dashboard
 * would report evidence toward clauses on a project that has never run a check.
 *
 * On a certification dashboard that is not a cosmetic error. The whole design rule of the three
 * status modules is that absence of evidence is reported as absence of evidence, and a flag set from
 * a constant defeats it at the boundary rather than in the module the rule is written in.
 *
 * `structuralCoverage` is deliberately absent from what this can report. Coverage comes from an
 * instrumented run on the applicant's target whose trace is submitted to the backend; nothing in the
 * project database records that it happened, so claiming it here would be the one flag this file
 * could get wrong in the direction that overstates.
 */
export function declaredEvidence(): DeclaredEvidence {
	const db = CertificationManager.getInstance().getProjectDb()
	if (!db) {
		return {}
	}

	try {
		const links = db.getAllLinks()
		return {
			// A recorded compliance check. The audit trail is where onComplianceCheck writes.
			complianceRun: countOf(db, "SELECT COUNT(*) AS count FROM audit_trail WHERE event_type = 'compliance_check'") > 0,
			traceability: links.length > 0,
			auditTrail: countOf(db, "SELECT COUNT(*) AS count FROM audit_trail") > 0,
			configurationIndex: countOf(db, "SELECT COUNT(*) AS count FROM integrity_check WHERE status = 'passed'") > 0,
		}
	} catch {
		// A project database predating one of these tables answers "nothing recorded", which is the
		// honest reading and the same one an empty project gets.
		return {}
	}
}

function countOf(db: ProjectDatabase, sql: string): number {
	try {
		const row = db.getRawDatabase().prepare(sql).get() as { count: number } | undefined
		return row?.count ?? 0
	} catch {
		return 0
	}
}
