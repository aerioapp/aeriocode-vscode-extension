import { describe, it } from "mocha"
import { expect } from "chai"
import { getAvailableProfiles } from "../getAvailableProfiles"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import type { Controller } from "../.."
import { ProfileLoader } from "@/certification/ProfileLoader"

/**
 * What the certification profile selector is offered.
 *
 * ⚠️ This exists because the selector was answering from a hardcoded array. `ProfileSelector.tsx`
 * declared its own `STANDARDS` — DO-178C with four DAL entries and a `// Future: ISO-26262` note —
 * so the certification screen offered one standard **after ECSS and NASA profiles existed, worked,
 * and were covered by their own tests**. The RPC and its controller were already written. Nothing
 * called them, and nothing could notice.
 *
 * So the assertions below are about the two things that would let it happen again: the controller
 * returning fewer profiles than exist, and the response dropping a field the screen needs to render
 * a non-DO-178C profile honestly.
 */

const noController = {} as Controller

describe("the certification profiles offered for selection", () => {
	it("offers every built-in profile, not just DO-178C", async () => {
		const response = await getAvailableProfiles(noController, {} as EmptyRequest)
		const names = response.profiles.map((p) => p.standard).sort()

		expect(names).to.deep.equal(["DO-178C", "ECSS-E-ST-40C", "NPR-7150.2D"])
		// Derived from the loader rather than restated, so adding a profile cannot leave this behind.
		expect(names).to.deep.equal([...ProfileLoader.builtinProfileNames()].sort())
	})

	it("does not depend on a profile having been seeded to disk first", async () => {
		// ⚠️ The controller listed the profiles *directory*. On a machine where nothing had been
		// seeded that returns an empty list, so the selector would have offered nothing at all — and
		// seeding only happens as a side effect of loading a profile, which the user cannot do from an
		// empty list. Asserting the count is non-zero is the cheap guard against that returning.
		const response = await getAvailableProfiles(noController, {} as EmptyRequest)
		expect(response.profiles.length).to.be.greaterThan(0)
		for (const profile of response.profiles) {
			expect(profile.levels.length, profile.standard).to.be.greaterThan(0)
		}
	})

	it("carries the regime, so the screen can use the right word for a level", async () => {
		// Three regimes label a level "A". Without the regime the selector would have to guess, and
		// the guess that reads naturally — "Level" or "DAL" — states a DO-178C classification.
		const byName = new Map(
			(await getAvailableProfiles(noController, {} as EmptyRequest)).profiles.map((p) => [p.standard, p]),
		)

		expect(byName.get("DO-178C")!.regime).to.equal("do-178c")
		expect(byName.get("ECSS-E-ST-40C")!.regime).to.equal("ecss")
		expect(byName.get("NPR-7150.2D")!.regime).to.equal("nasa")
	})

	it("gives NASA six levels and the others four", async () => {
		const byName = new Map(
			(await getAvailableProfiles(noController, {} as EmptyRequest)).profiles.map((p) => [p.standard, p]),
		)

		expect(byName.get("DO-178C")!.levels).to.have.length(4)
		expect(byName.get("ECSS-E-ST-40C")!.levels).to.have.length(4)
		expect(byName.get("NPR-7150.2D")!.levels).to.have.length(6)
	})

	it("keeps the inline classification short and the explanation separate", async () => {
		// The dropdown renders `label (failureCondition)` inline. These were one field carrying both
		// the classification and its rationale, which produced option labels a paragraph long the
		// first time a non-DO-178C profile was rendered.
		for (const profile of (await getAvailableProfiles(noController, {} as EmptyRequest)).profiles) {
			for (const level of profile.levels) {
				expect(level.failureCondition.length, `${profile.standard} ${level.label}`).to.be.lessThan(60)
			}
		}
		const nasa = (await getAvailableProfiles(noController, {} as EmptyRequest)).profiles.find(
			(p) => p.standard === "NPR-7150.2D",
		)!
		expect(nasa.levels.find((l) => l.id === "CLASS_F")!.assignedFrom).to.contain("separate axis")
	})

	it("carries a profile's own not-produced list through the proto projection", async () => {
		// Disclosure has to reach the screen where the choice is made, so a field present on the
		// profile and dropped by the controller would be disclosure nobody ever sees. NASA is the
		// only profile with an entry: its assurance deliverables are written by the assurance
		// organisation rather than drafted by Aerio.
		const profiles = (await getAvailableProfiles(noController, {} as EmptyRequest)).profiles
		const nasa = profiles.find((profile) => profile.standard === "NPR-7150.2D")!
		expect(nasa.unsupportedArtifacts.join(" ")).to.contain("Software Assurance Plan")
	})

	it("describes no profile by another regime's artifacts", async () => {
		// The list used to open with two DO-178C comparisons on every non-DO-178C profile, which
		// framed DO-178C as the baseline and the other two as deviations from it. See the matching
		// test in ProfileLoader.regimes.test.ts.
		for (const profile of (await getAvailableProfiles(noController, {} as EmptyRequest)).profiles) {
			if (profile.standard === "DO-178C") {
				continue
			}
			const text = profile.unsupportedArtifacts.join(" ")
			expect(text, profile.standard).to.not.contain("DO-178C")
			expect(text, profile.standard).to.not.contain("Annex A")
		}
	})

	it("cites where each regime defines its levels", async () => {
		for (const profile of (await getAvailableProfiles(noController, {} as EmptyRequest)).profiles) {
			expect(profile.levelBasis, profile.standard).to.not.equal("")
		}
	})
})
