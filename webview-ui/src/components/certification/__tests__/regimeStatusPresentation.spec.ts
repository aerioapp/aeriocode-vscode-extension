import { describe, it, expect } from "vitest"
import { STATUS_PRESENTATION, presentationFor } from "../regimeStatusPresentation"
import { COMPLIANCE_REGIMES, levelLetterOf, regimeForProfileStandard } from "@shared/compliance/regimes"

describe("regime status presentation", () => {
	it("has no satisfied status", () => {
		// ⚠️ The absence is the point. No backend dashboard emits `satisfied`, because satisfying an
		// Annex A objective, an Annex R expected output or a SWE requirement is a judgement made by an
		// accountable person. A green chip here would assert that judgement from the layer with least
		// standing to make it.
		expect(Object.keys(STATUS_PRESENTATION)).not.toContain("satisfied")
	})

	it("covers every status the two backends emit", () => {
		// The union of ecss-outputs.js STATUS and nasa-requirements.js STATUS. A status added there and
		// not here renders through the unknown-status path, which is loud by design — this keeps the
		// known ones from ever taking that path.
		for (const status of ["partial", "no-evidence", "to-be-agreed", "not-applicable", "out-of-scope", "conditional"]) {
			expect(STATUS_PRESENTATION[status], status).toBeDefined()
		}
	})

	it("keeps to-be-agreed and conditional distinct from both neighbours", () => {
		// Ytba is not "nothing recorded" and not "not applicable": it is a negotiation. Same for a NASA
		// requirement gated on the safety-critical determination. Rendering either as a neighbour would
		// misreport what the programme owes, in one direction or the other.
		for (const status of ["to-be-agreed", "conditional"]) {
			expect(STATUS_PRESENTATION[status].label).not.toEqual(STATUS_PRESENTATION["no-evidence"].label)
			expect(STATUS_PRESENTATION[status].label).not.toEqual(STATUS_PRESENTATION["not-applicable"].label)
			expect(STATUS_PRESENTATION[status].color).not.toEqual(STATUS_PRESENTATION["not-applicable"].color)
		}
	})

	it("renders an unrecognised status loudly rather than as nothing recorded", () => {
		// A status this build does not know means the backend is ahead of the webview. Falling back to
		// a neutral grey dot would file an uninterpreted state under the one reading that always looks
		// safe.
		const unknown = presentationFor("some-future-status")
		expect(unknown.icon).toBe("warning")
		expect(unknown.color).not.toEqual(STATUS_PRESENTATION["no-evidence"].color)
		expect(unknown.meaning).toContain("does not recognise")
	})
})

describe("choosing a dashboard from the active profile", () => {
	it("maps each built-in profile standard to its regime", () => {
		expect(regimeForProfileStandard("ECSS-E-ST-40C")).toBe("ecss")
		expect(regimeForProfileStandard("NPR-7150.2D")).toBe("nasa")
		expect(regimeForProfileStandard("DO-178C")).toBe("do-178c")
	})

	it("returns null rather than a guess for an unknown or absent profile", () => {
		// The component renders a sentence for null. A fallback to DO-178C would have sent an unknown
		// profile through the airborne view, which is the mistake this whole change set is about.
		expect(regimeForProfileStandard("IEC-62304")).toBeNull()
		expect(regimeForProfileStandard("")).toBeNull()
		expect(regimeForProfileStandard(undefined)).toBeNull()
	})

	it("gives ISO 26262 no certification profile", () => {
		expect(COMPLIANCE_REGIMES["iso-26262"].certificationProfileStandard).toBeNull()
	})

	it("strips each regime's own level prefix without converting between them", () => {
		// `CAT_B` is not "DAL B spelled differently" — the letter means a different thing, and the
		// regime travelling alongside carries that. So the letter comes back bare.
		expect(levelLetterOf("DAL_A")).toBe("A")
		expect(levelLetterOf("CAT_B")).toBe("B")
		expect(levelLetterOf("CLASS_F")).toBe("F")
		// ⚠️ The long spelling the alternation was written to accept. `CAT|CATEGORY` is ordered, so
		// `CAT` matched first and this returned `EGORY_B` — a level id no regime defines, which the
		// dashboard would then have asked the backend for.
		expect(levelLetterOf("CATEGORY_B")).toBe("B")
		expect(levelLetterOf("category-c")).toBe("c")
		expect(levelLetterOf("")).toBe("")
		expect(levelLetterOf(null)).toBe("")
	})

	it("offers every level the regime defines, including the two only NASA has", () => {
		expect(COMPLIANCE_REGIMES.ecss.levels).toEqual(["A", "B", "C", "D"])
		expect(COMPLIANCE_REGIMES.nasa.levels).toEqual(["A", "B", "C", "D", "E", "F"])
	})
})
