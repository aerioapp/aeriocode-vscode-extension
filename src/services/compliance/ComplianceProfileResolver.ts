import * as vscode from "vscode"
import { CertificationManager } from "@/certification/CertificationManager"
import { COMPLIANCE_REGIMES, asRegime, levelForRegime } from "@shared/compliance/regimes"
import type { ComplianceRegime } from "@shared/compliance/regimes"

/**
 * What coding standard is in force, and at what assurance level.
 *
 * One resolver, read by the two places that need the answer: the request that builds the system
 * prompt, and the gate that checks what the model wrote. A second source would let the model be
 * instructed under one standard and its output checked against another, which is worse than either
 * being wrong on its own — the findings would look like the model ignoring its instructions.
 *
 * ## Why workspace scope
 *
 * `vscode.workspace.getConfiguration` resolves folder → workspace → user, so a DAL A avionics repo
 * and an internal tool open in two windows each get their own answer without anybody remembering to
 * switch anything. That is the failure the previous design had: the standard was encoded in an
 * account-level model id, so it followed the developer rather than the code.
 *
 * ## Why off by default
 *
 * `standard` defaults to empty, which means no safety profile and no behaviour change. A developer
 * who installs the extension for ordinary work must not find their writes being analysed against an
 * avionics standard, and a project that has not declared a level should not have one assumed for it
 * — a wrong DAL is a claim about how much assurance the software needs.
 */

/*
 * ⚠️ `KNOWN_STANDARDS` was removed rather than updated.
 *
 * It listed the rule packs the backend registers, and its doc comment said it was "kept in sync by
 * ComplianceClient at runtime" — which nothing did. No production code read it; the only reference
 * left was a test asserting it did not name a withdrawn pack. So it was a second list of the shipped
 * standards, maintained by hand, checked against nothing, and free to disagree with the
 * `aeriocode.compliance.standard` enum in `package.json` that actually decides what a user can pick.
 *
 * The enum is the source of truth on this side and the backend registry is the authority overall.
 * Those two are worth testing against each other, and `__tests__/ComplianceProfileResolver.test.ts`
 * does. A third copy in the middle was only ever a place for them to drift apart quietly.
 *
 * `misra-c` and `misra-cpp` were withdrawn: their guideline numbers were recollected rather than
 * read, and MISRA's licence prohibits using the document to validate an AI tool, so they could never
 * be confirmed. Their checks still run — `aerio-scs` adopts them and reports them under rule ids
 * Aerio authored — so a workspace that had one selected loses a rule number, not analysis. The
 * backend answers a request for either with a 404 saying exactly that.
 */

/**
 * ⚠️ Regimes and their levels come from `@shared/compliance/regimes`, not from here.
 *
 * They were declared in this file and independently re-declared in three others, and by the time
 * the NASA regime arrived, all three copies had drifted into user-visible wrong answers — see that
 * module's header. Re-exported rather than re-stated so the existing call sites keep working while
 * there is exactly one definition behind them.
 */
export { COMPLIANCE_REGIMES, REGIME_IDS as REGIMES, asRegime, levelForRegime } from "@shared/compliance/regimes"
export type { ComplianceRegime } from "@shared/compliance/regimes"

export interface ResolvedComplianceProfile {
	standard: string
	/** A level of {@link regime}. Null where neither the certification profile nor the workspace set one. */
	level: string | null
	regime: ComplianceRegime
	/**
	 * Where {@link level} came from, so a screen can say so rather than presenting it as a free
	 * choice it is not.
	 */
	levelSource: "certification" | "workspace" | "none"
}

/**
 * The assurance level declared by an active certification profile, normalised.
 *
 * ⚠️ This is the fix for two screens disagreeing about one fact. The certification section reported
 * "DO-178C — DAL_A active" while the coding-standard picker reported the level as unset, because each
 * had its own store. A user seeing both cannot tell which one the model is actually being held to,
 * and the honest answer was "neither of them alone".
 *
 * The certification profile wins. Declaring a design assurance level is a certification act, made
 * once through profile setup and recorded in the audit trail; the setting is the route for a project
 * that wants the coding standard without the certification module. Making the setting win would let
 * a stray edit silently contradict the programme's own declared level.
 *
 * The two vocabularies differ — `DAL_A` there, `A` here — which is exactly the kind of seam where a
 * second source of truth hides.
 */
function levelFromCertification(): { level: string; regime: ComplianceRegime } | null {
	const active = CertificationManager.peekActiveProfile()
	if (!active) {
		return null
	}
	const level = active.level.replace(/^(DAL|ASIL|CAT|CATEGORY|CLASS)[_-]?/i, "").trim()
	// ⚠️ Asked, not guessed. This pattern-matched the standard's *name* to decide the regime —
	// `/26262|ASIL/`, then `/ECSS|E-ST-40|Q-ST-80/`, then `/NPR ?7150|NASA/`, then a DO-178C
	// fallback. Every certification profile now declares the regime it belongs to, so the guess is
	// gone: a profile named something none of those patterns anticipated used to fall through to
	// DO-178C and label a space programme's category a design assurance level, silently.
	//
	// The name-matching survives only as a fallback for a profile seeded by a build older than the
	// `regime` field, and it is the same order as before so that case is unchanged.
	const declared = `${active.standard} ${active.level}`
	const regime: ComplianceRegime = active.regime
		? asRegime(active.regime)
		: /26262|ASIL/i.test(declared)
			? "iso-26262"
			: /ECSS|E-ST-40|Q-ST-80/i.test(declared)
				? "ecss"
				: /NPR ?7150|NASA/i.test(declared)
					? "nasa"
					: "do-178c"
	return levelForRegime(regime, level) ? { level, regime } : null
}

const SECTION = "aeriocode.compliance"

/**
 * The profile for a file, or null when this workspace is not doing safety-critical work.
 *
 * `resource` matters in a multi-root workspace: a repository containing both certified software and
 * its build tooling can scope the setting per folder, and passing the file being written is what
 * makes that resolve correctly. Without it every folder gets the workspace-level answer.
 */
export function resolveComplianceProfile(resource?: vscode.Uri): ResolvedComplianceProfile | null {
	const config = vscode.workspace.getConfiguration(SECTION, resource ?? null)

	const standard = (config.get<string>("standard") || "").trim()
	if (!standard) {
		return null
	}

	// One level, and the certification profile is where it is declared when there is one. The setting
	// still resolves it for a project using the coding standard without the certification module.
	const certified = levelFromCertification()
	if (certified) {
		return { standard, level: certified.level, regime: certified.regime, levelSource: "certification" }
	}

	const regime = asRegime(config.get<string>("regime"))
	const rawLevel = (config.get<string>("level") || "").trim()

	// An unrecognised level is dropped rather than passed through. The backend uses it to decide
	// which rules apply, so a typo would quietly relax the standard — and the prompt would name a
	// level the user never chose. The settings enum offers A-F and QM in one list because VS Code
	// cannot vary one enum by another setting, so a level from the wrong regime is a routine
	// mistake rather than an exotic one.
	const level = levelForRegime(regime, rawLevel)

	if (rawLevel && !level) {
		console.warn(
			`[Aeriocode] aeriocode.compliance.level "${rawLevel}" is not valid for ${regime}; ` +
				`expected one of ${COMPLIANCE_REGIMES[regime].levels.join(", ")}. ` +
				`Continuing with no level, which applies the standard in full.`,
		)
	}

	return { standard, level, regime, levelSource: level ? "workspace" : "none" }
}

/** A one-line description for the status bar and for logs. */
export function describeProfile(profile: ResolvedComplianceProfile | null): string {
	if (!profile) {
		return "No coding standard in force"
	}
	const levelLabel = profile.level ? ` · ${COMPLIANCE_REGIMES[profile.regime].levelWord} ${profile.level}` : ""
	return `${profile.standard}${levelLabel}`
}

/**
 * Fire `onChange` whenever the resolved profile could have changed.
 *
 * Returned as a disposable the caller owns. Settings changes mid-session are the normal case — a
 * developer turns the standard on partway through a task — and a session that kept the profile it
 * started with would check new writes against a standard the user had already switched away from.
 */
export function watchComplianceProfile(onChange: () => void): vscode.Disposable {
	return vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration(SECTION)) {
			onChange()
		}
	})
}
