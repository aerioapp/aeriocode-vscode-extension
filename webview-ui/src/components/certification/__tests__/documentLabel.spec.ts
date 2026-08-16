import { describe, expect, it } from "vitest"
import { documentLabel } from "../ProfileSelector"

/**
 * The picker rendered `${id} ${revision}` unconditionally, which reads correctly only when the
 * revision is not already part of the id. For the NASA and DO-178C documents it is, producing
 * "NPR 7150.2D D" and "DO-178C C" — one document made to look like two tokens.
 */
describe("documentLabel", () => {
	it("drops a revision letter the id already ends with", () => {
		expect(documentLabel("NPR 7150.2D", "D")).to.equal("NPR 7150.2D")
		expect(documentLabel("DO-178C", "C")).to.equal("DO-178C")
		expect(documentLabel("NPR-7150.2D", "D")).to.equal("NPR-7150.2D")
	})

	it("keeps detail that follows a repeated revision letter", () => {
		// The "B" is already in the id; the approval date is not and is worth showing.
		expect(documentLabel("NASA-STD-8739.8B", "B (approved 2022-09-08)")).to.equal("NASA-STD-8739.8B (approved 2022-09-08)")
	})

	it("keeps a revision that adds information", () => {
		expect(documentLabel("DO-178C", "2011")).to.equal("DO-178C 2011")
		expect(documentLabel("ECSS-E-ST-40C", "Rev.1")).to.equal("ECSS-E-ST-40C Rev.1")
		expect(documentLabel("NASA-HDBK-2203", "Version D")).to.equal("NASA-HDBK-2203 Version D")
	})

	it("compares case-insensitively", () => {
		expect(documentLabel("NPR 7150.2d", "D")).to.equal("NPR 7150.2d")
	})

	it("returns the id alone when there is no revision", () => {
		expect(documentLabel("DO-330")).to.equal("DO-330")
		expect(documentLabel("DO-330", "")).to.equal("DO-330")
		expect(documentLabel("DO-330", "   ")).to.equal("DO-330")
		expect(documentLabel("DO-330", null)).to.equal("DO-330")
	})
})
