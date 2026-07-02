import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import ApiOptions from "../ApiOptions"
import { ExtensionStateContextProvider, useExtensionState } from "@/context/ExtensionStateContext"
import { ApiConfiguration } from "@shared/api"

vi.mock("../../../context/ExtensionStateContext", async (importOriginal) => {
	const actual = await importOriginal()
	return {
		...(actual || {}),
		// your mocked methods
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

const mockExtensionState = (apiConfiguration: Partial<ApiConfiguration>) => {
	vi.mocked(useExtensionState).mockReturnValue({
		apiConfiguration,
		setApiConfiguration: vi.fn(),
		uriScheme: "vscode",
		aeriocodeModels: {},
		planActSeparateModelsSetting: false,
	} as any)
}

describe("ApiOptions Component", () => {
	vi.clearAllMocks()
	const mockPostMessage = vi.fn()

	beforeEach(() => {
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: mockPostMessage }
		mockExtensionState({
			planModeApiProvider: "aeriocode",
			actModeApiProvider: "aeriocode",
		})
	})

	it("renders Aeriocode Account ID input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions showModelOptions={true} currentMode="plan" />
			</ExtensionStateContextProvider>,
		)
		const accountIdInput = screen.getByPlaceholderText("Enter Account ID...")
		expect(accountIdInput).toBeInTheDocument()
	})

	it("renders Aeriocode Model ID input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions showModelOptions={true} currentMode="plan" />
			</ExtensionStateContextProvider>,
		)
		const modelIdInput = screen.getByPlaceholderText("Search and select a model...")
		expect(modelIdInput).toBeInTheDocument()
	})
})
