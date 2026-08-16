import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

/**
 * The ECSS and NASA status dashboards.
 *
 * ⚠️ The property under test is that **the two regimes render as two different things**. Both had
 * profiles, applicability projections and backend endpoints and no view at all, and the tempting way
 * to give them one is a single table fed by a regime-agnostic call. That table cannot show ECSS's
 * Ytba rows or NASA's conditional ones, and each of those is the difference between an obligation
 * and no obligation.
 */

const getEcssOutputStatus = vi.fn()
const getNasaRequirementStatus = vi.fn()

vi.mock("@/services/grpc-client", () => ({
	VerificationServiceClient: {
		getEcssOutputStatus: (...args: unknown[]) => getEcssOutputStatus(...args),
		getNasaRequirementStatus: (...args: unknown[]) => getNasaRequirementStatus(...args),
	},
}))

import RegimeStatusDashboard from "../RegimeStatusDashboard"

const ecssResponse = {
	document: "ECSS-E-ST-40C Rev.1",
	publisher: "ECSS / ESA",
	attribution: "Clause identifications are cited as facts. Aerio makes no claim of ECSS conformance.",
	category: "C",
	outputsInStandard: 303,
	applicableAtCategory: 289,
	toBeAgreed: 18,
	withPartialEvidence: 2,
	withNoEvidence: 200,
	outOfScopeForAerio: 87,
	statement: "289 of 303 Annex R expected outputs apply at criticality category C.",
	rows: [
		{
			id: "5.8.3.6a eo a",
			output: "Software unit tests traceability",
			force: "to-be-agreed",
			status: "to-be-agreed",
			contributes: "",
		},
		{
			id: "5.3.2.1c",
			output: "Development strategy, standards",
			force: "required",
			status: "partial",
			contributes: "The declared coding standard.",
		},
	],
	error: "",
}

const nasaResponse = {
	document: "NPR 7150.2D",
	publisher: "NASA",
	attribution: "SWE identifiers are cited as facts. Aerio makes no claim of NPR 7150.2D conformance.",
	softwareClass: "A",
	requirementsInMatrix: 100,
	applicableAtClass: 100,
	conditional: 2,
	withPartialEvidence: 4,
	withNoEvidence: 68,
	outOfScopeForAerio: 26,
	statement: "100 of 100 Appendix C requirements apply at software classification A.",
	rows: [
		{
			id: "SWE-219",
			section: "3.7.4",
			applicable: true,
			status: "conditional",
			contributes: "",
			condition: "the project has identified safety-critical software components",
		},
	],
	error: "",
}

describe("RegimeStatusDashboard", () => {
	beforeEach(() => {
		getEcssOutputStatus.mockReset().mockResolvedValue(ecssResponse)
		getNasaRequirementStatus.mockReset().mockResolvedValue(nasaResponse)
	})

	it("renders ECSS expected outputs, with the Ytba count as its own figure", async () => {
		render(<RegimeStatusDashboard profileStandard="ECSS-E-ST-40C" profileLevel="CAT_C" />)

		await waitFor(() => expect(screen.getByText(/289 of 303/)).toBeInTheDocument())
		expect(screen.getByText("to be agreed")).toBeInTheDocument()
		expect(screen.getByText("18")).toBeInTheDocument()
		expect(screen.getByText("Software unit tests traceability")).toBeInTheDocument()
		// And never the other regime's word.
		expect(screen.queryByText("conditional")).not.toBeInTheDocument()
	})

	it("renders NASA requirements, with the conditional count as its own figure", async () => {
		render(<RegimeStatusDashboard profileStandard="NPR-7150.2D" profileLevel="CLASS_A" />)

		await waitFor(() => expect(screen.getByText(/100 of 100/)).toBeInTheDocument())
		expect(screen.getByText("conditional")).toBeInTheDocument()
		// The condition itself is shown, not just the count: a class A project whose software is not
		// safety-critical owes neither SWE-219 nor SWE-220, and the number alone does not say that.
		expect(screen.getByText(/identified safety-critical software components/)).toBeInTheDocument()
		expect(screen.queryByText("to be agreed")).not.toBeInTheDocument()
	})

	it("asks the backend for the level the profile is activated at", async () => {
		render(<RegimeStatusDashboard profileStandard="ECSS-E-ST-40C" profileLevel="CAT_C" />)

		await waitFor(() => expect(getEcssOutputStatus).toHaveBeenCalled())
		expect(getEcssOutputStatus.mock.calls[0][0]).toMatchObject({ value: "C" })
	})

	it("labels each regime's level with the publisher's own word", async () => {
		const { unmount } = render(<RegimeStatusDashboard profileStandard="ECSS-E-ST-40C" profileLevel="CAT_C" />)
		await waitFor(() => expect(screen.getByText("Software criticality category")).toBeInTheDocument())
		unmount()

		render(<RegimeStatusDashboard profileStandard="NPR-7150.2D" profileLevel="CLASS_A" />)
		await waitFor(() => expect(screen.getByText("Software classification")).toBeInTheDocument())
	})

	it("says so rather than showing an empty table for a regime with no view", async () => {
		// A DO-178C profile. An empty expected-output table would read as "your programme owes nothing".
		render(<RegimeStatusDashboard profileStandard="DO-178C" profileLevel="DAL_A" />)

		expect(screen.getByText(/No expected-output view is available for DO-178C/)).toBeInTheDocument()
		expect(getEcssOutputStatus).not.toHaveBeenCalled()
		expect(getNasaRequirementStatus).not.toHaveBeenCalled()
	})

	it("surfaces a backend error instead of rendering an empty result", async () => {
		// "You are signed out" has to reach the screen as a message. An empty table would read as
		// "there is nothing here", which is the opposite of what happened.
		getEcssOutputStatus.mockResolvedValue({ ...ecssResponse, rows: [], error: "You must be signed in" })

		render(<RegimeStatusDashboard profileStandard="ECSS-E-ST-40C" profileLevel="CAT_A" />)

		await waitFor(() => expect(screen.getByText(/You must be signed in/)).toBeInTheDocument())
	})

	it("does not claim anything is satisfied", async () => {
		render(<RegimeStatusDashboard profileStandard="ECSS-E-ST-40C" profileLevel="CAT_C" />)

		await waitFor(() => expect(screen.getByText(/289 of 303/)).toBeInTheDocument())
		expect(screen.queryByText(/satisfied/i)).not.toBeInTheDocument()
	})
})
