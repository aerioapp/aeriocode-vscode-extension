import { describe, it, beforeEach } from "mocha"
import { expect } from "chai"
import { __configStore, __resetConfig } from "@/test/vscode-mock"
import { describeProfile, resolveComplianceProfile } from "../ComplianceProfileResolver"
import { CertificationManager } from "@/certification/CertificationManager"

/**
 * What decides that a session is safety-critical.
 *
 * The configuration values here are read through the same double the extension's other tests use,
 * and its defaults come from the real `package.json` rather than a copy — so a test asserting the
 * feature is off by default is asserting that the *shipped* default is off, not that a fixture says
 * so. That distinction matters here more than usual: the whole design rests on this being inert
 * until somebody deliberately turns it on.
 */

const set = (key: string, value: unknown) => __configStore.set(`aeriocode.compliance.${key}`, value)

describe("resolving the compliance profile", () => {
	beforeEach(() => {
		__resetConfig()
	})

	describe("by default", () => {
		it("is off, from the default the extension actually ships", () => {
			// A developer installing this for ordinary work must not find their writes analysed
			// against an avionics standard.
			expect(resolveComplianceProfile()).to.equal(null)
		})

		it("describes itself as off rather than as an empty standard", () => {
			expect(describeProfile(null)).to.equal("No coding standard in force")
		})
	})

	describe("when a standard is set", () => {
		it("resolves it with the level and regime", () => {
			set("standard", "aerio-scs")
			set("level", "A")

			expect(resolveComplianceProfile()).to.deep.equal({
				standard: "aerio-scs",
				level: "A",
				// The shipped default, not a value this test supplied.
				regime: "do-178c",
				// From the setting, because no certification profile is active in this suite.
				levelSource: "workspace",
			})
		})

		it("accepts a standard with no level, which applies it in full", () => {
			// A programme that has not been assigned a DAL should not have one assumed for it — the
			// level is a claim about how much assurance the software needs.
			set("standard", "aerio-scs")

			expect(resolveComplianceProfile()).to.deep.equal({
				standard: "aerio-scs",
				level: null,
				regime: "do-178c",
				levelSource: "none",
			})
		})

		it("trims whitespace rather than treating it as a standard name", () => {
			set("standard", "  aerio-scs  ")
			expect(resolveComplianceProfile()?.standard).to.equal("aerio-scs")
		})

		it("treats a whitespace-only standard as off", () => {
			set("standard", "   ")
			expect(resolveComplianceProfile()).to.equal(null)
		})
	})

	describe("when the level does not belong to the regime", () => {
		it("drops a DAL that is not one of A to D", () => {
			// Passing it through would name a level in the prompt that the user never chose, and
			// the backend uses it to decide which rules apply — so a typo would quietly relax the
			// standard rather than failing visibly.
			set("standard", "aerio-scs")
			set("level", "E")

			const profile = resolveComplianceProfile()
			expect(profile?.standard).to.equal("aerio-scs")
			expect(profile?.level).to.equal(null)
		})

		it("drops a DAL value when the regime is automotive", () => {
			// "QM" is meaningful for ISO 26262 and meaningless for DO-178C, and the reverse holds
			// for nothing — so the check has to be per regime rather than a shared list.
			set("standard", "aerio-scs")
			set("regime", "do-178c")
			set("level", "QM")

			expect(resolveComplianceProfile()?.level).to.equal(null)
		})

		it("accepts QM under ISO 26262", () => {
			set("standard", "aerio-scs")
			set("regime", "iso-26262")
			set("level", "QM")

			expect(resolveComplianceProfile()).to.deep.equal({
				standard: "aerio-scs",
				level: "QM",
				regime: "iso-26262",
				levelSource: "workspace",
			})
		})

		it("accepts an ECSS software criticality category", () => {
			// The space regime. ECSS categories run A to D exactly as DAL does, so this cannot be
			// distinguished from the airborne case by the level alone — which is the whole reason the
			// regime travels alongside it rather than being inferred.
			set("standard", "aerio-scs")
			set("regime", "ecss")
			set("level", "B")

			expect(resolveComplianceProfile()).to.deep.equal({
				standard: "aerio-scs",
				level: "B",
				regime: "ecss",
				levelSource: "workspace",
			})
		})

		it("drops QM under ECSS, which defines no such category", () => {
			// ⚠️ The failure this guards is silent relaxation. ECSS categories are A to D; QM belongs to
			// ISO 26262. Passing it through would leave the backend with a level it cannot resolve, and
			// the applicability lookup would return null for every rule — reading as "nothing applies"
			// rather than as a mistake.
			set("standard", "aerio-scs")
			set("regime", "ecss")
			set("level", "QM")

			expect(resolveComplianceProfile()?.level).to.equal(null)
		})

		it("names an ECSS level a category, not a DAL", () => {
			// The two scales share their letters, so the word is the only thing on screen that says
			// which one is in force. Calling an ECSS category a DAL states a DO-178C classification
			// nobody made.
			set("standard", "aerio-scs")
			set("regime", "ecss")
			set("level", "A")

			expect(describeProfile(resolveComplianceProfile())).to.contain("Category A")
			expect(describeProfile(resolveComplianceProfile())).to.not.contain("DAL")
		})

		it("accepts a NASA software classification, including the two letters no other regime has", () => {
			// E and F exist only here. A resolver that shared one level list across the regimes would
			// either reject them or leak them into DO-178C, and both are silent wrong answers.
			set("standard", "aerio-scs")
			set("regime", "nasa")
			set("level", "E")

			expect(resolveComplianceProfile()).to.deep.equal({
				standard: "aerio-scs",
				level: "E",
				regime: "nasa",
				levelSource: "workspace",
			})

			set("level", "F")
			expect(resolveComplianceProfile()?.level).to.equal("F")
		})

		it("drops E and F under ECSS and DO-178C, which define no such level", () => {
			// ⚠️ The mirror of the QM case, and the one a user is most likely to hit: the level enum in
			// settings offers A to F and QM in one list, because VS Code has no way to vary an enum by
			// another setting. So picking "F" while the regime says ECSS is a plausible mistake, and
			// passing it through would leave every rule resolving to null — reading as "nothing
			// applies" rather than as a misconfiguration.
			set("standard", "aerio-scs")
			for (const regime of ["ecss", "do-178c"]) {
				set("regime", regime)
				for (const level of ["E", "F"]) {
					set("level", level)
					expect(resolveComplianceProfile()?.level, `${regime} ${level}`).to.equal(null)
				}
			}
		})

		it("names a NASA level a class, not a category or a DAL", () => {
			// Three regimes now label a level "A" and mean three different things. The word is the only
			// thing on screen that says which, so calling a NASA class a DAL states a DO-178C
			// classification nobody made — and calling it a category states an ECSS one.
			set("standard", "aerio-scs")
			set("regime", "nasa")
			set("level", "A")

			const described = describeProfile(resolveComplianceProfile())
			expect(described).to.contain("Class A")
			expect(described).to.not.contain("DAL")
			expect(described).to.not.contain("Category")
		})

		it("takes the regime the certification profile declares, rather than guessing from its name", () => {
			// ⚠️ The resolver used to pattern-match the standard's name to pick a regime, with DO-178C as
			// the fallback — so a profile whose name none of the patterns anticipated was labelled a
			// design assurance level silently. Every built-in profile now declares its regime.
			for (const [standard, level, regime, word] of [
				["ECSS", "CAT_B", "ecss", "Category B"],
				["NASA-NPR-7150.2D", "CLASS_F", "nasa", "Class F"],
				["DO-178C", "DAL_A", "do-178c", "DAL A"],
			] as const) {
				;(CertificationManager as any).instance = {
					getActiveProfile: () => ({ standard, regime }),
					getActiveProfileLevel: () => level,
				}
				set("standard", "aerio-scs")
				const resolved = resolveComplianceProfile()
				expect(resolved?.regime, standard).to.equal(regime)
				expect(resolved?.levelSource, standard).to.equal("certification")
				expect(describeProfile(resolved), standard).to.contain(word)
			}
			;(CertificationManager as any).instance = undefined
		})

		it("still falls back to the name for a profile seeded before the regime field existed", () => {
			// A profile file seeded by an older build has no `regime`, and refusing it would break a
			// workspace that was working. The name-matching survives for exactly that case.
			;(CertificationManager as any).instance = {
				getActiveProfile: () => ({ standard: "ECSS" }),
				getActiveProfileLevel: () => "CAT_C",
			}
			set("standard", "aerio-scs")
			expect(resolveComplianceProfile()?.regime).to.equal("ecss")
			;(CertificationManager as any).instance = undefined
		})

		it("falls back to DO-178C for an unrecognised regime", () => {
			// Rather than inventing a third regime the backend has no applicability table for.
			set("standard", "aerio-scs")
			set("regime", "iec-61508")
			set("level", "A")

			expect(resolveComplianceProfile()?.regime).to.equal("do-178c")
		})
	})

	describe("the assurance level has one source, not two", () => {
		// ⚠️ Reported by a user: the certification section showed "DO-178C — DAL_A active" while the
		// coding-standard picker showed the level as unset, because each screen had its own store. A
		// user seeing both cannot tell which one the model is actually held to, and the honest answer
		// was neither of them alone. This is the same second-source-of-truth defect this codebase has
		// refused for rule mappings, for the four BARRIERS maps, and for one standard versus two.
		const withCertification = (profile: { standard: string; level: string } | null, run: () => void) => {
			const original = CertificationManager.peekActiveProfile
			;(CertificationManager as any).peekActiveProfile = () => profile
			try {
				run()
			} finally {
				;(CertificationManager as any).peekActiveProfile = original
			}
		}

		it("takes the level from an active certification profile", () => {
			set("standard", "aerio-scs")
			withCertification({ standard: "DO-178C", level: "DAL_A" }, () => {
				const resolved = resolveComplianceProfile()
				expect(resolved?.level).to.equal("A")
				expect(resolved?.levelSource).to.equal("certification")
			})
		})

		it("normalises the certification vocabulary, which is not the one used here", () => {
			// `DAL_A` there, `A` here. That mismatch is exactly the seam a second store hides behind.
			set("standard", "aerio-scs")
			withCertification({ standard: "DO-178C", level: "DAL_C" }, () => {
				expect(resolveComplianceProfile()?.level).to.equal("C")
			})
		})

		it("lets the certification profile override a contradicting setting", () => {
			// Declaring a DAL is a certification act recorded in the audit trail. A stray edit to a
			// settings file must not quietly relax what the programme has declared about itself.
			set("standard", "aerio-scs")
			set("level", "D")
			withCertification({ standard: "DO-178C", level: "DAL_A" }, () => {
				expect(resolveComplianceProfile()?.level).to.equal("A")
			})
		})

		it("falls back to the setting when no certification profile is active", () => {
			// The route for a project that wants the coding standard without the certification module.
			set("standard", "aerio-scs")
			set("level", "B")
			withCertification(null, () => {
				const resolved = resolveComplianceProfile()
				expect(resolved?.level).to.equal("B")
				expect(resolved?.levelSource).to.equal("workspace")
			})
		})

		it("ignores a certification level that is not valid for its regime", () => {
			// Silence beats a guess: an unrecognised level would otherwise be passed to the backend,
			// which uses it to decide which rules apply.
			set("standard", "aerio-scs")
			withCertification({ standard: "DO-178C", level: "DAL_Q" }, () => {
				expect(resolveComplianceProfile()?.level).to.equal(null)
			})
		})
	})

	describe("the description shown to the user", () => {
		it("names the standard and the level in the regime's own vocabulary", () => {
			expect(describeProfile({ standard: "aerio-scs", level: "A", regime: "do-178c", levelSource: "workspace" })).to.equal(
				"aerio-scs · DAL A",
			)
			expect(
				describeProfile({ standard: "aerio-scs", level: "D", regime: "iso-26262", levelSource: "workspace" }),
			).to.equal("aerio-scs · ASIL D")
		})

		it("omits the level when none is set rather than showing an empty one", () => {
			expect(describeProfile({ standard: "aerio-scs", level: null, regime: "do-178c", levelSource: "none" })).to.equal(
				"aerio-scs",
			)
		})
	})

	describe("the settings the extension declares", () => {
		it("offers exactly the standards the backend registers", () => {
			// A picker offering a standard the backend does not have produces a session the route
			// rejects, after the user has already selected it.
			const properties = require("../../../../package.json").contributes.configuration.properties
			expect(properties["aeriocode.compliance.standard"].enum).to.deep.equal(["", "aerio-scs", "jf-avpp", "power-of-10"])
		})

		it("does not offer a withdrawn standard", () => {
			// The MISRA packs were withdrawn from the backend registry: their guideline numbers were
			// recollected rather than read, and MISRA's licence prohibits using the document to
			// validate an AI tool, so they could never be confirmed. Their checks still run under
			// aerio-scs. Leaving them in the picker would let a user select a standard every request
			// then 404s on.
			const properties = require("../../../../package.json").contributes.configuration.properties
			const offered = properties["aeriocode.compliance.standard"].enum

			expect(offered).to.not.include("misra-c")
			expect(offered).to.not.include("misra-cpp")
		})

		it("describes every standard it offers", () => {
			// An enum entry with no description shows in the settings UI as a bare id. The two lists
			// are separate arrays matched by position, so dropping one without the other silently
			// shifts every description onto the wrong standard.
			const property =
				require("../../../../package.json").contributes.configuration.properties["aeriocode.compliance.standard"]
			expect(property.enumDescriptions).to.have.lengthOf(property.enum.length)
		})

		it("scopes every compliance setting to the resource", () => {
			// Window scope would make the standard follow the developer rather than the code, which
			// is the failure the previous model-id design had.
			const properties = require("../../../../package.json").contributes.configuration.properties
			for (const key of Object.keys(properties).filter((name) => name.startsWith("aeriocode.compliance."))) {
				expect(properties[key].scope, key).to.equal("resource")
			}
		})
	})
})
