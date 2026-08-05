import * as vscode from "vscode"
import { CertificationManager } from "@/certification/CertificationManager"

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

/** Ids of rule packs the backend registers. Kept in sync by ComplianceClient at runtime. */
export const KNOWN_STANDARDS = ["aerio-scs", "jf-avpp", "misra-c", "misra-cpp", "power-of-10"] as const

export const DAL_LEVELS = ["A", "B", "C", "D"] as const
export const ASIL_LEVELS = ["D", "C", "B", "A", "QM"] as const

export interface ResolvedComplianceProfile {
	standard: string
	/** DAL A–D or an ASIL. Null where neither the certification profile nor the workspace set one. */
	level: string | null
	regime: "do-178c" | "iso-26262"
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
function levelFromCertification(): { level: string; regime: "do-178c" | "iso-26262" } | null {
	const active = CertificationManager.peekActiveProfile()
	if (!active) {
		return null
	}
	const level = active.level.replace(/^(DAL|ASIL)[_-]?/i, "").trim()
	const regime = /26262|ASIL/i.test(active.standard + active.level) ? "iso-26262" : "do-178c"
	const valid: readonly string[] = regime === "iso-26262" ? ASIL_LEVELS : DAL_LEVELS
	return valid.includes(level) ? { level, regime } : null
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

	const regime = config.get<string>("regime") === "iso-26262" ? "iso-26262" : "do-178c"
	const rawLevel = (config.get<string>("level") || "").trim()

	// An unrecognised level is dropped rather than passed through. The backend uses it to decide
	// which rules apply, so a typo would quietly relax the standard — and the prompt would name a
	// level the user never chose.
	const valid: readonly string[] = regime === "iso-26262" ? ASIL_LEVELS : DAL_LEVELS
	const level = valid.includes(rawLevel) ? rawLevel : null

	if (rawLevel && !level) {
		console.warn(
			`[Aeriocode] aeriocode.compliance.level "${rawLevel}" is not valid for ${regime}; ` +
				`expected one of ${valid.join(", ")}. Continuing with no level, which applies the standard in full.`,
		)
	}

	return { standard, level, regime, levelSource: level ? "workspace" : "none" }
}

/** A one-line description for the status bar and for logs. */
export function describeProfile(profile: ResolvedComplianceProfile | null): string {
	if (!profile) {
		return "No coding standard in force"
	}
	const levelLabel = profile.level ? ` · ${profile.regime === "iso-26262" ? "ASIL" : "DAL"} ${profile.level}` : ""
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
