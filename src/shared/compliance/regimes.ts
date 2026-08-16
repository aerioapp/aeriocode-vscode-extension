/**
 * The assurance regimes a compliance profile can name, and the levels each defines.
 *
 * ⚠️ **One definition, read by four places that each had their own.** The extension host's
 * resolver, the `setComplianceProfile` writer, the status bar and the webview picker all needed
 * this, and all four carried a private copy. Three of them were already wrong by the time this file
 * was written, and each was wrong silently:
 *
 * - the picker offered **DO-178C and ISO 26262 only**, so the ECSS regime — shipped, with a full
 *   applicability projection behind it — could not be selected at all;
 * - `setComplianceProfile` collapsed anything that was not `iso-26262` to `do-178c`, so a user who
 *   set ECSS by hand in `settings.json` had it rewritten to DO-178C the next time they touched the
 *   picker, and the settings file then asserted an airborne classification they never made;
 * - the status bar labelled every non-ISO level a **DAL**, so an ECSS category B session read as
 *   "DAL B" — a DO-178C claim no publisher supports.
 *
 * None of the three failed loudly, and the third is the one that would have reached a report.
 *
 * This is the second-source-of-truth defect this codebase has now refused six times, and the first
 * where the copies had already diverged into user-visible wrong answers rather than merely being at
 * risk of it.
 *
 * ## The backend is still the authority
 *
 * `services/compliance/standards/aerio-scs/applicability.js` holds the regimes and their levels, and
 * `services/compliance/profile.js` validates an incoming profile against the pack the request names.
 * A level this file let through that the pack does not define is dropped there, so this being wrong
 * cannot relax the standard — it can only fail to offer something. Keeping it in step is a test's
 * job, not a hope.
 */

/**
 * ⚠️ Four regimes, three of them lettering their levels A–D, and they mean three different things.
 *
 * A **DO-178C design assurance level** is a failure condition classification. An **ECSS software
 * criticality category** is a function's severity category *modulated by* whether a compensating
 * provision exists outside the software — the same software in a catastrophic function is category A
 * with no backstop and category B with one, a modulation DO-178C has no equivalent of. A **NASA
 * software classification** is assigned from the kind of mission the software serves, runs to F, and
 * is not one severity ladder: class F is general-purpose business and IT software on a separate axis,
 * and it carries the coding-standard requirement that class E does not.
 *
 * No publisher defines a mapping between any two of them. Nothing here converts, and the level word
 * is what carries on screen the distinction the letter cannot.
 */
export interface RegimeSpec {
	/** What the standards body calls one of these levels, short enough to sit inline beside it. */
	readonly levelWord: string
	/**
	 * The same thing at length, for a field label with room for it — "Design assurance level" rather
	 * than "DAL".
	 *
	 * ⚠️ A field rather than a `switch` in the one screen that wanted it. `ProfileSelector` carried
	 * exactly that switch, with a silent `"Level"` default, which made it the **fifth** private copy
	 * of this table in a change whose purpose was collapsing the other four. A regime added here and
	 * nowhere else would have rendered as the generic word with nothing failing — the same silence
	 * that let the picker omit ECSS for a whole release.
	 */
	readonly levelWordLong: string
	/** The levels this regime defines, in the publisher's own order. */
	readonly levels: readonly string[]
	/** Short label for a picker. */
	readonly label: string
	/**
	 * Shown under the picker when this regime does something a user would not expect. Empty where
	 * there is nothing surprising to say — a note on every option is a note nobody reads.
	 */
	readonly caveat: string
	/**
	 * Whether the picker offers this regime.
	 *
	 * ⚠️ **Not the same as whether it is understood.** A regime with no applicability projection is
	 * one Aerio has no answer for, and offering it in a picker is a claim of support: a user selects
	 * it, nothing changes, and they have no way to tell that from "my code is fine". So it is not
	 * offered.
	 *
	 * It stays *known*, though, and that distinction is load-bearing. Deleting it outright would make
	 * {@link asRegime} silently rewrite a stored `iso-26262` to `do-178c` — which is precisely the
	 * defect this module was created to fix, where the profile writer collapsed ECSS to DO-178C and
	 * left the settings file asserting an airborne classification nobody chose. A value already in
	 * `settings.json` is still honoured, still validated against its own levels, and still shown.
	 */
	readonly selectable: boolean
	/**
	 * The `standard` of the built-in certification profile serving this regime, or `null` where none
	 * does.
	 *
	 * ⚠️ Here rather than in `ProfileLoader`, because **both directions of this mapping are needed and
	 * they were about to be declared separately.** The extension host needs regime → profile to load
	 * the right built-in; the webview needs profile → regime to know which status dashboard to open,
	 * having only the standard's name in its state. Two maps written from opposite ends of the same
	 * three pairs is the shape this module exists to refuse.
	 *
	 * `iso-26262` is null and that is the honest entry, not a gap: Aerio holds no copy of it, and a
	 * certification profile asserting ASIL artifacts and coverage figures would invent exactly what
	 * the declared-empty applicability map refuses to.
	 */
	readonly certificationProfileStandard: string | null
}

export const COMPLIANCE_REGIMES = {
	"do-178c": {
		levelWord: "DAL",
		levelWordLong: "Design assurance level",
		certificationProfileStandard: "DO-178C",
		levels: ["A", "B", "C", "D"],
		label: "DO-178C — airborne",
		caveat: "",
		selectable: true,
	},
	ecss: {
		levelWord: "Category",
		levelWordLong: "Software criticality category",
		certificationProfileStandard: "ECSS-E-ST-40C",
		levels: ["A", "B", "C", "D"],
		label: "ECSS — space, European",
		selectable: true,
		caveat: "ECSS requires the coding standard you declared to be observed at every criticality category, so the projection is flat: only three process rules about naming tools in the plan are not applicable at category D. Certification artifacts — objective tables, document drafts — are DO-178C only.",
	},
	nasa: {
		levelWord: "Class",
		levelWordLong: "Software classification",
		certificationProfileStandard: "NPR-7150.2D",
		levels: ["A", "B", "C", "D", "E", "F"],
		label: "NASA — space, NPR 7150.2",
		selectable: true,
		caveat: "Six classifications, and not one severity scale: class F is business and IT software on a separate axis, not the bottom of the list. No rule applies at class E — NPR 7150.2D asks no coding requirement of class E software. The eight rules governing AI-assisted authoring do not apply at class D and return at class F, because the requirement covering generated code stops at class C. Certification artifacts — objective tables, document drafts — are DO-178C only.",
	},
	// ⚠️ Known but **not offered**. Aerio holds no copy of ISO 26262, so the applicability map ships
	// declared-empty and every rule reports as undetermined at every ASIL — selecting it would apply
	// the standard in full and change nothing a user could observe. Listing it beside three regimes
	// that do carry a projection would read as "supported, pick your level", which it is not.
	"iso-26262": {
		levelWord: "ASIL",
		levelWordLong: "Automotive safety integrity level",
		certificationProfileStandard: null,
		levels: ["D", "C", "B", "A", "QM"],
		label: "ISO 26262 — road vehicles (not available)",
		caveat: "Aerio holds no copy of ISO 26262 and asserts no mapping from these rules to ASILs, so no level applies and the standard is applied in full. This regime is recognised so an existing setting is not silently rewritten, but it is not offered as a choice.",
		selectable: false,
	},
} as const satisfies Record<string, RegimeSpec>

export type ComplianceRegime = keyof typeof COMPLIANCE_REGIMES

/** Every regime this build understands, including ones it does not offer. */
export const REGIME_IDS = Object.keys(COMPLIANCE_REGIMES) as ComplianceRegime[]

/**
 * The regimes a picker should offer, plus `current` if it is a known-but-unselectable one.
 *
 * Passing the current value in is what stops the picker misrepresenting a stored setting: a project
 * configured for a regime that is no longer offered must see it, and see it labelled, rather than
 * see the dropdown quietly showing something else.
 */
export function selectableRegimes(current?: string | null): ComplianceRegime[] {
	const offered = REGIME_IDS.filter((id) => COMPLIANCE_REGIMES[id].selectable)
	const stored = current && (current in COMPLIANCE_REGIMES ? (current as ComplianceRegime) : null)
	return stored && !offered.includes(stored) ? [...offered, stored] : offered
}

/** The regime a stored or requested value names, or DO-178C where it names none this build knows. */
export function asRegime(value: string | null | undefined): ComplianceRegime {
	return value && value in COMPLIANCE_REGIMES ? (value as ComplianceRegime) : "do-178c"
}

/**
 * The level if it belongs to the regime, otherwise null.
 *
 * ⚠️ Null rather than a fallback, and the caller must not substitute one. A level from the wrong
 * regime is a misconfiguration — `QM` under DO-178C, `F` under ECSS — and the settings UI cannot
 * prevent it because VS Code has no way to vary one enum by another setting's value. Dropping it
 * applies the standard in full, which is the stricter reading; guessing a nearby level would relax
 * the standard on the user's behalf without telling them.
 */
export function levelForRegime(regime: ComplianceRegime, level: string | null | undefined): string | null {
	const trimmed = (level || "").trim()
	return trimmed && COMPLIANCE_REGIMES[regime].levels.includes(trimmed as never) ? trimmed : null
}

/**
 * The regime a built-in certification profile belongs to, from its `standard` name.
 *
 * The inverse of {@link RegimeSpec.certificationProfileStandard}, derived rather than declared. The
 * webview holds the active profile's standard name and needs to know which status dashboard that
 * profile has — ECSS's expected outputs, NASA's SWE requirements, or DO-178C's Annex A objectives.
 */
export function regimeForProfileStandard(standard: string | null | undefined): ComplianceRegime | null {
	if (!standard) {
		return null
	}
	const match = REGIME_IDS.find((id) => COMPLIANCE_REGIMES[id].certificationProfileStandard === standard)
	return match ?? null
}

/**
 * A level letter from a certification profile's level id.
 *
 * ⚠️ The prefixes are the profile's own — `DAL_A`, `CAT_B`, `CLASS_D` — and each names the regime it
 * came from, which is why they are stripped rather than translated. `CAT_B` is not "DAL B with a
 * different spelling": the letter means a different thing, and the regime travelling alongside is
 * what carries that. Returning the bare letter keeps the two facts separate.
 */
export function levelLetterOf(levelId: string | null | undefined): string {
	// ⚠️ `CATEGORY` before `CAT`. Regex alternation is ordered, so the shorter spelling matched first
	// and `CATEGORY_B` came back as `EGORY_B` — an id this function was written to accept, silently
	// mangled into one no regime defines, which the dashboard would then have asked the backend for.
	return (levelId || "").replace(/^(CATEGORY|CLASS|ASIL|DAL|CAT)[_-]?/i, "").trim()
}
