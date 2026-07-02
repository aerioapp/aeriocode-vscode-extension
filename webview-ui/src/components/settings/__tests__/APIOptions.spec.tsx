import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import ApiOptions from "../ApiOptions"
import { ExtensionStateContextProvider, useExtensionState } from "@/context/ExtensionStateContext"

vi.mock("../../../context/ExtensionStateContext", async (importOriginal) => {
	const actual = await importOriginal()
	return {
		...(actual || {}),
		useExtensionState: vi.fn(() => ({
			apiConfiguration: {
				planModeApiProvider: "aeriocode",
				actModeApiProvider: "aeriocode",
				aeriocodeAccountId: "",
				planModeApiModelId: "",
				actModeApiModelId: "",
			},
			setApiConfiguration: vi.fn(),
			uriScheme: "vscode",
			aeriocodeModels: {},
			planActSeparateModelsSetting: false,
		})),
	}
})

vi.mock("@/context/AeriocodeAuthContext", () => ({
	useAeriocodeAuth: vi.fn(() => ({
		aeriocodeUser: undefined,
		aeriocodeBalance: undefined,
		isLoading: false,
	})),
}))

describe("ApiOptions Component", () => {
	vi.clearAllMocks()

	beforeEach(() => {
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: vi.fn() }
		vi.mocked(useExtensionState).mockReturnValue({
			apiConfiguration: {
				planModeApiProvider: "aeriocode",
				actModeApiProvider: "aeriocode",
				aeriocodeAccountId: "",
				planModeApiModelId: "",
				actModeApiModelId: "",
			},
			setApiConfiguration: vi.fn(),
			uriScheme: "vscode",
			aeriocodeModels: {},
			planActSeparateModelsSetting: false,
		} as any)
	})

	it("renders Aeriocode account sign-up button", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions showModelOptions={true} currentMode="plan" />
			</ExtensionStateContextProvider>,
		)
		const signUpButton = screen.getByText("Sign Up with Aeriocode")
		expect(signUpButton).toBeInTheDocument()
	})

	it("renders model dropdown with available models", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions showModelOptions={true} currentMode="plan" />
			</ExtensionStateContextProvider>,
		)
		const modelLabel = screen.getByText("Model")
		expect(modelLabel).toBeInTheDocument()
		const aerioCodeOption = screen.getByText("AerioCode")
		expect(aerioCodeOption).toBeInTheDocument()
	})
})
