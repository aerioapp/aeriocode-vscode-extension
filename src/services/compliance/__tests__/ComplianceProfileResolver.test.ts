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
			expect(properties["aeriocode.compliance.standard"].enum).to.deep.equal([
				"",
				"aerio-scs",
				"jf-avpp",
				"misra-c",
				"misra-cpp",
				"power-of-10",
			])
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
