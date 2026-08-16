import { describe, it } from "mocha"
import { expect } from "chai"
import * as fs from "fs"
import * as path from "path"
import { COMPLIANCE_REGIMES, REGIME_IDS, asRegime, levelForRegime, selectableRegimes } from "../regimes"

/**
 * The regime definition against the two things that have to agree with it.
 *
 * ⚠️ The claim in `regimes.ts` is that keeping this in step is "a test's job, not a hope". This is
 * that job. Four copies of this data existed before it, three had drifted into user-visible wrong
 * answers, and none of them failed anything — so an assertion is the only thing that will notice.
 *
 * `package.json` is read from disk rather than imported as a constant, because what ships is the
 * file: a picker offering a regime the settings enum rejects is a regime a user can select and not
 * persist, which is the same silent shape as the defects this replaced.
 */

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../../package.json"), "utf-8"))
const settings = packageJson.contributes.configuration.properties

describe("the assurance regimes", () => {
	it("offers exactly the regimes the settings enum accepts", () => {
		// A regime in one and not the other is selectable somewhere and unstorable, or storable and
		// invisible — which is how ECSS came to ship with a projection nobody could turn on.
		expect([...REGIME_IDS].sort()).to.deep.equal([...settings["aeriocode.compliance.regime"].enum].sort())
	})

	it("offers no level the settings enum cannot store", () => {
		// The level enum is one flat list because VS Code cannot vary an enum by another setting's
		// value, so it is the union — every regime's levels have to appear in it.
		const storable = new Set<string>(settings["aeriocode.compliance.level"].enum)
		for (const id of REGIME_IDS) {
			for (const level of COMPLIANCE_REGIMES[id].levels) {
				expect(storable.has(level), `${id} level ${level}`).to.equal(true)
			}
		}
	})

	it("describes every regime it offers, in the settings enum and in the picker", () => {
		const spec = settings["aeriocode.compliance.regime"]
		expect(spec.enumDescriptions).to.have.length(spec.enum.length)
		for (const id of REGIME_IDS) {
			expect(COMPLIANCE_REGIMES[id].label, id).to.not.equal("")
			expect(COMPLIANCE_REGIMES[id].levelWord, id).to.not.equal("")
		}
	})

	it("gives each regime its own word for a level, because three of them share their letters", () => {
		// ⚠️ The failure this guards produced a real wrong claim: the status bar called every non-ISO
		// level a "DAL", so an ECSS category B session read as "DAL B" — a DO-178C classification no
		// publisher supports. The letters cannot distinguish these scales; only the word can.
		const words = REGIME_IDS.map((id) => COMPLIANCE_REGIMES[id].levelWord)
		expect(new Set(words).size).to.equal(words.length)

		// And the letters really do collide, so the assertion above is not passing vacuously.
		expect(COMPLIANCE_REGIMES["do-178c"].levels).to.deep.equal([...COMPLIANCE_REGIMES.ecss.levels])
		expect(COMPLIANCE_REGIMES.nasa.levels.slice(0, 4)).to.deep.equal([...COMPLIANCE_REGIMES["do-178c"].levels])
	})

	it("keeps NASA's two extra classes out of every other regime", () => {
		// E and F exist only under NASA. Leaking either into DO-178C or ECSS would let a user store a
		// level whose applicability table has no entry, and every rule would resolve to null — reading
		// as "nothing applies" rather than as a misconfiguration.
		for (const id of REGIME_IDS) {
			for (const level of ["E", "F"]) {
				expect(COMPLIANCE_REGIMES[id].levels.includes(level as never), `${id} ${level}`).to.equal(id === "nasa")
			}
		}
	})

	it("orders NASA's classes as the directive does rather than by severity", () => {
		// ⚠️ Not sorted, and it must not be "tidied" into severity order. Class F is general-purpose
		// business and IT software on a separate axis — it is not weaker than class E, it carries the
		// coding-standard requirement class E does not. A reader who takes A-F for one descending
		// ladder gets exactly the wrong answer about both.
		expect([...COMPLIANCE_REGIMES.nasa.levels]).to.deep.equal(["A", "B", "C", "D", "E", "F"])
	})

	it("drops a level from the wrong regime rather than substituting a nearby one", () => {
		expect(levelForRegime("do-178c", "QM")).to.equal(null)
		expect(levelForRegime("do-178c", "F")).to.equal(null)
		expect(levelForRegime("ecss", "E")).to.equal(null)
		expect(levelForRegime("nasa", "QM")).to.equal(null)
		expect(levelForRegime("iso-26262", "E")).to.equal(null)

		expect(levelForRegime("nasa", "F")).to.equal("F")
		expect(levelForRegime("nasa", " E ")).to.equal("E")
		expect(levelForRegime("ecss", "D")).to.equal("D")
		expect(levelForRegime("do-178c", "")).to.equal(null)
		expect(levelForRegime("do-178c", null)).to.equal(null)
	})

	it("does not offer ISO 26262, because there is nothing behind it", () => {
		// ⚠️ Aerio holds no copy of ISO 26262, so its applicability map is declared-empty and every
		// rule reports as undetermined at every ASIL. Selecting it would apply the standard in full
		// and change nothing a user could observe — and a picker listing it beside three regimes that
		// do carry a projection is a claim of support.
		expect(selectableRegimes()).to.not.include("iso-26262")
		expect(selectableRegimes()).to.deep.equal(["do-178c", "ecss", "nasa"])

		// Offered means it has a projection to offer. If a fourth regime is ever added without one,
		// this is what refuses it.
		for (const id of selectableRegimes()) {
			expect(COMPLIANCE_REGIMES[id].selectable, id).to.equal(true)
		}
	})

	it("still recognises a stored regime it does not offer, rather than rewriting it", () => {
		// ⚠️ The whole reason it is not simply deleted. Removing it would make `asRegime` resolve a
		// stored `iso-26262` to `do-178c` — silently converting a workspace to an airborne design
		// assurance level nobody chose, which is the exact defect this module was created to fix.
		expect(asRegime("iso-26262")).to.equal("iso-26262")
		expect(levelForRegime("iso-26262", "QM")).to.equal("QM")
		expect(COMPLIANCE_REGIMES["iso-26262"].levelWord).to.equal("ASIL")

		// And a picker showing that workspace gets the option back, so the dropdown cannot display
		// something other than what is stored.
		expect(selectableRegimes("iso-26262")).to.include("iso-26262")
		expect(selectableRegimes("nasa")).to.not.include("iso-26262")
		expect(COMPLIANCE_REGIMES["iso-26262"].label).to.contain("not available")
	})

	it("keeps the settings enum a superset of what the picker offers", () => {
		// The enum has to keep an unofferable regime so an existing settings.json does not show a
		// validation error against the shipped schema.
		const enumerated: string[] = settings["aeriocode.compliance.regime"].enum
		for (const id of selectableRegimes()) {
			expect(enumerated, id).to.include(id)
		}
		expect(enumerated).to.include("iso-26262")
	})

	it("states the same number of AI-authoring rules everywhere it states one", () => {
		// ⚠️ These disagreed: the standard's enumDescription said "seven rules constraining AI-assisted
		// authoring" while the NASA caveat and the regime's markdownDescription said eight. Eight is
		// right — the set is TOOL-3 through TOOL-10. Seven was the number *added* in the same change
		// (TOOL-4 to TOOL-10), and the two counts were close enough to look like the same fact.
		//
		// Both strings are read by a user deciding what the tool enforces, in the same settings screen,
		// so they cannot be allowed to differ by an off-by-one that reads as deliberate.
		const properties = require("../../../../package.json").contributes.configuration.properties
		const stated = [
			...properties["aeriocode.compliance.standard"].enumDescriptions,
			properties["aeriocode.compliance.regime"].markdownDescription,
			COMPLIANCE_REGIMES.nasa.caveat,
		]
			.join(" ")
			.match(/\b(\w+) rules (?:constraining|governing) AI-assisted authoring/g)

		expect(stated, "no statement of the AI-authoring rule count was found").to.not.equal(null)
		expect(new Set(stated!.map((phrase) => phrase.split(" ")[0])).size).to.equal(1)
		expect(stated![0]).to.match(/^eight /)
	})

	it("falls back to DO-178C for a regime this build does not know", () => {
		// Rather than inventing one the backend has no applicability table for. A stored value from a
		// newer build reaching an older one is the realistic case.
		expect(asRegime("iec-61508")).to.equal("do-178c")
		expect(asRegime("")).to.equal("do-178c")
		expect(asRegime(undefined)).to.equal("do-178c")
		expect(asRegime("nasa")).to.equal("nasa")
	})
})
