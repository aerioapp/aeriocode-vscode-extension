import { describe, it } from "mocha"
import { expect } from "chai"
import { ProfileLoader } from "../ProfileLoader"
import type { CertificationLevel, CertificationProfile } from "../types"
import { COMPLIANCE_REGIMES, selectableRegimes } from "@shared/compliance/regimes"

/**
 * A certification profile for every regime a user can select, and the ways the three differ.
 *
 * ⚠️ The reason this file exists: `ProfileLoader` shipped **one** profile. `loadProfileByName`
 * special-cased `"DO-178C"` and fell through to the filesystem for anything else, so a project on
 * ECSS or NASA got `null` — reported as "no profile" rather than "not supported", which is the
 * silent shape this codebase keeps finding.
 *
 * The assertions below are deliberately about the *differences*. A profile set that had been
 * produced by copying DO-178C and relabelling would pass a "does it load" test and fail every one
 * of these, which is the point: the three regimes are not one shape in three vocabularies.
 */

const levelsOf = (p: CertificationProfile): CertificationLevel[] => Object.values(p.levels)

describe("certification profiles", () => {
	it("supplies one for every regime the picker offers, and none for the one it does not", () => {
		for (const regime of selectableRegimes()) {
			const profile = ProfileLoader.profileForRegime(regime)
			expect(profile, regime).to.not.equal(null)
			expect(profile!.regime, regime).to.equal(regime)
		}

		// ⚠️ ISO 26262 gets no profile, and that is deliberate rather than missing. Aerio holds no
		// copy of it, so a profile stating ASIL coverage figures and required artifacts would invent
		// exactly what the empty applicability map exists to refuse.
		expect(ProfileLoader.profileForRegime("iso-26262")).to.equal(null)
		expect(ProfileLoader.profileForRegime("iec-61508")).to.equal(null)
	})

	it("names its levels in its own regime's vocabulary", () => {
		// Three regimes label a level "A" and mean three different things. A profile whose labels came
		// from another regime would put "DAL A" on an ECSS screen.
		const cases: [string, string][] = [
			["do-178c", "DAL"],
			["ecss", "Category"],
			["nasa", "Class"],
		]
		for (const [regime, word] of cases) {
			const profile = ProfileLoader.profileForRegime(regime)!
			expect(COMPLIANCE_REGIMES[regime as keyof typeof COMPLIANCE_REGIMES].levelWord, regime).to.equal(word)
			for (const level of levelsOf(profile)) {
				expect(level.label, `${regime} ${level.label}`).to.contain(word)
			}
		}
	})

	it("gives each regime the number of levels its publisher defines", () => {
		expect(Object.keys(ProfileLoader.profileForRegime("do-178c")!.levels)).to.have.length(4)
		expect(Object.keys(ProfileLoader.profileForRegime("ecss")!.levels)).to.have.length(4)
		// Six, not four. NASA runs to class F.
		expect(Object.keys(ProfileLoader.profileForRegime("nasa")!.levels)).to.have.length(6)
	})

	it("keeps the profile's levels in step with the regime's", () => {
		// The two lists are declared in different repositories' worth of code, and a level in one and
		// not the other is a level a user can select and not activate.
		for (const regime of selectableRegimes()) {
			const profile = ProfileLoader.profileForRegime(regime)!
			const spec = COMPLIANCE_REGIMES[regime as keyof typeof COMPLIANCE_REGIMES]
			expect(Object.keys(profile.levels), regime).to.have.length(spec.levels.length)
			for (const letter of spec.levels) {
				const found = levelsOf(profile).some((l) => l.label.endsWith(` ${letter}`))
				expect(found, `${regime} has a level for ${letter}`).to.equal(true)
			}
		}
	})

	describe("the three regimes differ in shape, not just in wording", () => {
		it("DO-178C fixes a coverage number per level and shrinks its artifact list", () => {
			const p = ProfileLoader.profileForRegime("do-178c")!
			expect(p.levels.DAL_A.mcdc_coverage).to.equal(100)
			expect(p.levels.DAL_B.mcdc_coverage).to.equal(0)
			expect(p.levels.DAL_A.required_artifacts.length).to.be.greaterThan(p.levels.DAL_D.required_artifacts.length)
		})

		it("ECSS defers coverage below category B rather than setting it to zero", () => {
			// ⚠️ `to-be-agreed`, not 0 and not 100. ECSS-E-ST-40C marks C and D "TBA" — agreed with the
			// customer and measured per ECSS-Q-ST-80 clause 6.3.5.2. Storing 0 would tell a supplier no
			// coverage is required; storing 100 would invent an agreement they never made.
			const p = ProfileLoader.profileForRegime("ecss")!
			expect(p.levels.CAT_A.statement_coverage).to.equal(100)
			expect(p.levels.CAT_B.statement_coverage).to.equal(100)
			expect(p.levels.CAT_C.statement_coverage).to.equal("to-be-agreed")
			expect(p.levels.CAT_D.decision_coverage).to.equal("to-be-agreed")

			// And MC/DC is TBA at category B — where DO-178C Level B requires none at all. Reading one
			// as the other is wrong in both directions, so both are pinned together.
			expect(p.levels.CAT_B.mcdc_coverage).to.equal("to-be-agreed")
			expect(ProfileLoader.profileForRegime("do-178c")!.levels.DAL_B.mcdc_coverage).to.equal(0)
		})

		it("ECSS keeps the same deliverables at every category, unlike DO-178C", () => {
			// Annex R tailors at clause granularity: the document stays and part of its content becomes
			// negotiable. The artifact list is therefore constant, which is the opposite of DO-178C.
			const p = ProfileLoader.profileForRegime("ecss")!
			const lists = levelsOf(p).map((l) => l.required_artifacts.join("|"))
			expect(new Set(lists).size).to.equal(1)
		})

		it("ECSS drops independent verification at C and D, where Table R-1 marks it not applicable", () => {
			const p = ProfileLoader.profileForRegime("ecss")!
			expect(p.levels.CAT_A.verification_independence).to.equal(true)
			expect(p.levels.CAT_B.verification_independence).to.equal(true)
			expect(p.levels.CAT_C.verification_independence).to.equal(false)
			expect(p.levels.CAT_D.verification_independence).to.equal(false)
		})

		it("NASA gates coverage on safety-criticality rather than on class", () => {
			// ⚠️ The single most important difference. SWE-219 requires 100% MC/DC "if a project has
			// safety-critical software", not "if the software is class A". A profile that wrote 100 at
			// class A and 0 at class D would have projected DO-178C's shape onto a directive that does
			// not have it.
			const p = ProfileLoader.profileForRegime("nasa")!
			for (const key of ["CLASS_A", "CLASS_B", "CLASS_C", "CLASS_D"]) {
				expect(p.levels[key].mcdc_coverage, key).to.equal("conditional")
				expect(p.levels[key].coverage_condition, key).to.contain("safety-critical")
			}
			// Not applicable where SWE-219 does not reach.
			expect(p.levels.CLASS_E.mcdc_coverage).to.equal("not-applicable")
			expect(p.levels.CLASS_F.mcdc_coverage).to.equal("not-applicable")
		})

		it("NASA class F is not the bottom of the scale", () => {
			// ⚠️ F is business and IT software on a separate axis. It carries the artifacts class E does
			// not, so a reader treating A-F as one descending ladder gets this backwards.
			const p = ProfileLoader.profileForRegime("nasa")!
			expect(p.levels.CLASS_F.required_artifacts.length).to.be.greaterThan(p.levels.CLASS_E.required_artifacts.length)
			// Class E carries only the two planning artifacts the directive marks applicable there.
			expect(p.levels.CLASS_E.required_artifacts).to.have.length(2)
		})

		it("NASA records independence as recommended, which is what the directive says", () => {
			// The note to SWE-219 recommends independence rather than requiring it. `false` would
			// understate the directive and `true` would overstate it, so there is a third value.
			const p = ProfileLoader.profileForRegime("nasa")!
			expect(p.levels.CLASS_A.verification_independence).to.equal("recommended")
			expect(p.levels.CLASS_E.verification_independence).to.equal(false)
		})
	})

	it("describes no profile in terms of another regime's artifacts", () => {
		// ⚠️ This test previously asserted the opposite: that ECSS and NASA profiles must mention
		// "Annex A". They did, and it was wrong — DO-178C is not the baseline the other two are
		// variants of. A space programme reading that its profile lacks the airborne deliverables of
		// a standard it is not certifying against learns nothing it can act on, and the framing
		// quietly asserts a hierarchy among three independent standards that no publisher states.
		//
		// What a profile may say is what it does not produce *within its own regime*.
		const foreign: Record<string, string[]> = {
			"do-178c": ["Annex R", "DRD", "NPR 7150", "SWE-", "NASA"],
			ecss: ["Annex A", "DO-178C", "DO-330", "PSAC", "NPR 7150", "SWE-"],
			nasa: ["Annex A", "Annex R", "DO-178C", "DO-330", "PSAC", "DRD"],
		}

		for (const [regime, terms] of Object.entries(foreign)) {
			const text = (ProfileLoader.profileForRegime(regime)!.unsupported_artifacts ?? []).join(" ")
			for (const term of terms) {
				expect(text, `${regime} must not cite ${term}`).to.not.contain(term)
			}
		}
	})

	it("keeps the assurance-deliverable gap NASA states in its own terms", () => {
		// The one genuine "not produced" left, and it is regime-native: NASA-STD-8739.8B assigns these
		// to the assurance organisation, whose remit includes reviewing Aerio's output.
		const text = (ProfileLoader.profileForRegime("nasa")!.unsupported_artifacts ?? []).join(" ")
		expect(text).to.contain("Software Assurance Plan")
		expect(text).to.contain("assurance organisation")
	})

	it("cites where each regime's levels are defined, without reproducing the text", () => {
		expect(ProfileLoader.profileForRegime("ecss")!.level_basis).to.contain("ECSS-Q-ST-80C")
		// Appendix D. This said Appendix E until the appendix boundaries were checked — E is References.
		expect(ProfileLoader.profileForRegime("nasa")!.level_basis).to.contain("Appendix D")
	})

	it("lists every built-in profile by name", () => {
		expect(ProfileLoader.builtinProfileNames().sort()).to.deep.equal(["DO-178C", "ECSS-E-ST-40C", "NPR-7150.2D"])
		for (const name of ProfileLoader.builtinProfileNames()) {
			expect(ProfileLoader.loadProfileByName(name), name).to.not.equal(null)
		}
	})

	describe("each regime uses its own requirement vocabulary", () => {
		/**
		 * ⚠️ All three profiles carried `["system", "high_level", "low_level", "derived"]` — DO-178C's
		 * layers, copied onto two publishers that state their own. It is the quietest way for two
		 * regimes to be "the same thing": every visible difference was correct, and the field a
		 * programme actually classifies its requirements with was airborne on all three.
		 */
		it("does not give ECSS or NASA DO-178C's high-level and low-level layers", () => {
			for (const regime of ["ecss", "nasa"]) {
				const levels = ProfileLoader.profileForRegime(regime)!.requirement_levels
				expect(levels, regime).to.not.include("high_level")
				expect(levels, regime).to.not.include("low_level")
			}
			// DO-178C keeps them, because they are its own.
			expect(ProfileLoader.profileForRegime("do-178c")!.requirement_levels).to.include("high_level")
		})

		it("uses the requirements baseline and technical specification for ECSS", () => {
			// ECSS-E-ST-40C Rev.1 validates against these two separately, in clauses 5.6.4 and 5.6.3.
			const levels = ProfileLoader.profileForRegime("ecss")!.requirement_levels
			expect(levels).to.include("requirements-baseline")
			expect(levels).to.include("technical-specification")
		})

		it("does not offer derived requirements under ECSS", () => {
			// The phrase does not occur once in ECSS-E-ST-40C Rev.1. It is a DO-178C concept carrying a
			// specific obligation — 5.1.2.h, provide them to the system safety assessment — and offering
			// it here would invite a supplier to fill a bucket their standard asks nothing of.
			expect(ProfileLoader.profileForRegime("ecss")!.requirement_levels).to.not.include("derived")
			expect(ProfileLoader.profileForRegime("do-178c")!.requirement_levels).to.include("derived")
		})

		it("carries the hazard trace layer for NASA, which neither other regime has", () => {
			// SWE-052 Table 1 requires bi-directional traceability from software requirements to
			// software-related system hazards. DO-178C routes that through the system safety assessment
			// instead, so a profile reusing its levels had nowhere to record it.
			expect(ProfileLoader.profileForRegime("nasa")!.requirement_levels).to.include("hazard")
			for (const regime of ["do-178c", "ecss"]) {
				expect(ProfileLoader.profileForRegime(regime)!.requirement_levels, regime).to.not.include("hazard")
			}
		})

		it("gives no two regimes the same requirement levels", () => {
			const shapes = ["do-178c", "ecss", "nasa"].map((regime) =>
				ProfileLoader.profileForRegime(regime)!.requirement_levels.join("|"),
			)
			expect(new Set(shapes).size).to.equal(3)
		})
	})

	it("does not let a built-in profile be mutated in place", () => {
		// The profiles are shared singletons now that they are built in code rather than parsed from a
		// file per call, so one caller pushing onto an artifact list would rewrite what every later
		// caller sees. `ECSS_DRDS` makes it sharper: the same array object is on all four categories.
		const profile = ProfileLoader.profileForRegime("ecss")!
		expect(Object.isFrozen(profile)).to.equal(true)
		expect(Object.isFrozen(profile.levels.CAT_A.required_artifacts)).to.equal(true)
		expect(() => profile.levels.CAT_A.required_artifacts.push("injected")).to.throw()
	})

	it("does not resolve a profile name off Object.prototype", () => {
		// `loadProfileByName` takes a string off a protobus request. A plain object answers
		// "constructor" with a truthy Function, which would have been handed back as a profile.
		for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
			expect(ProfileLoader.loadProfileByName(name), name).to.equal(null)
		}
		expect(ProfileLoader.profileForRegime("constructor")).to.equal(null)
	})
})

describe("profiles name the document, not the publisher", () => {
	it("identifies each profile by the standard it certifies against", () => {
		// ⚠️ These read `ECSS` and `NASA-NPR-7150.2D`. "ECSS" is a standards body with dozens of
		// publications and "NASA" publishes several software standards that bind different parties, so
		// a panel showing either told a supplier which organisation they answered to and not which
		// document. DO-178C was already specific because DO-178C *is* the document.
		expect(ProfileLoader.builtinProfileNames().sort()).to.deep.equal(["DO-178C", "ECSS-E-ST-40C", "NPR-7150.2D"])
	})

	it("still loads a profile activated under its old name", () => {
		// ⚠️ The property this rename could have broken, and it would have broken quietly. A project
		// that activated `ECSS` has that string in `.aeriocode/profile.json`; a null here is reported
		// by the certification module as *no profile*, so the project would have kept its requirements
		// and audit trail while silently no longer being held to anything.
		for (const [alias, expected] of [
			["ECSS", "ECSS-E-ST-40C"],
			["NASA-NPR-7150.2D", "NPR-7150.2D"],
			["NASA", "NPR-7150.2D"],
		]) {
			const profile = ProfileLoader.loadProfileByName(alias)
			expect(profile, `alias ${alias}`).to.not.equal(null)
			expect(profile!.standard, `alias ${alias}`).to.equal(expected)
		}
	})

	it("does not offer an alias as a separate profile", () => {
		// Each profile appears once in the picker, under its real name.
		expect(ProfileLoader.builtinProfileNames()).to.not.include("ECSS")
		expect(ProfileLoader.builtinProfileNames()).to.not.include("NASA")
	})

	it("names every published document each profile is built from", () => {
		// ⚠️ No regime here is one document, and the headline one is not always the one that matters:
		// ECSS's criticality categories come from ECSS-Q-ST-80C, not from ECSS-E-ST-40C. Naming only
		// the standard the profile is *of* would credit it with obligations it does not contain.
		const ecss = ProfileLoader.loadProfileByName("ECSS-E-ST-40C")!
		const ids = (ecss.based_on ?? []).map((d) => d.id)
		expect(ids).to.include("ECSS-E-ST-40C")
		expect(ids).to.include("ECSS-Q-ST-80C")

		const nasa = ProfileLoader.loadProfileByName("NPR-7150.2D")!
		const nasaIds = (nasa.based_on ?? []).map((d) => d.id)
		expect(nasaIds).to.include("NPR 7150.2D")
		expect(nasaIds).to.include("NASA-STD-8739.8B")
		expect(nasaIds).to.include("NASA-HDBK-2203")
	})

	it("gives every profile a title, so a screen can say what the standard is", () => {
		for (const name of ProfileLoader.builtinProfileNames()) {
			const profile = ProfileLoader.loadProfileByName(name)!
			expect(profile.title, name).to.be.a("string").and.not.equal("")
			expect((profile.based_on ?? []).length, name).to.be.greaterThan(0)
		}
	})
})
