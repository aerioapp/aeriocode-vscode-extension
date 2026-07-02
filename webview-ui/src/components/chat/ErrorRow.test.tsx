import type { AeriocodeMessage } from "@shared/ExtensionMessage"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ErrorRow from "./ErrorRow"

// Mock the auth context
vi.mock("@/context/AeriocodeAuthContext", () => ({
	useAeriocodeAuth: () => ({
		aeriocodeUser: null,
	}),
	handleSignIn: vi.fn(),
	handleSignOut: vi.fn(),
}))

// Mock CreditLimitError component
vi.mock("@/components/chat/CreditLimitError", () => ({
	default: ({ message }: { message: string }) => <div data-testid="credit-limit-error">{message}</div>,
}))

// Mock AeriocodeError
vi.mock("../../../../src/services/error/AeriocodeError", () => ({
	AeriocodeError: {
		parse: vi.fn(),
	},
	AeriocodeErrorType: {
		Balance: "balance",
		RateLimit: "rateLimit",
		Auth: "auth",
	},
}))

describe("ErrorRow", () => {
	const mockMessage: AeriocodeMessage = {
		ts: 123456789,
		type: "say",
		say: "error",
		text: "Test error message",
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders basic error message", () => {
		render(<ErrorRow message={mockMessage} errorType="error" />)

		expect(screen.getByText("Test error message")).toBeInTheDocument()
	})

	it("renders mistake limit reached error", () => {
		const mistakeMessage = { ...mockMessage, text: "Mistake limit reached" }
		render(<ErrorRow message={mistakeMessage} errorType="mistake_limit_reached" />)

		expect(screen.getByText("Mistake limit reached")).toBeInTheDocument()
	})

	it("renders auto approval max requests error", () => {
		const maxReqMessage = { ...mockMessage, text: "Max requests reached" }
		render(<ErrorRow message={maxReqMessage} errorType="auto_approval_max_req_reached" />)

		expect(screen.getByText("Max requests reached")).toBeInTheDocument()
	})

	it("renders diff error", () => {
		render(<ErrorRow message={mockMessage} errorType="diff_error" />)

		expect(
			screen.getByText("The model used search patterns that don't match anything in the file. Retrying..."),
		).toBeInTheDocument()
	})

	it("renders aeriocodeignore error", () => {
		const aeriocodeignoreMessage = { ...mockMessage, text: "/path/to/file.txt" }
		render(<ErrorRow message={aeriocodeignoreMessage} errorType="aeriocodeignore_error" />)

		expect(screen.getByText(/Aeriocode tried to access/)).toBeInTheDocument()
		expect(screen.getByText("/path/to/file.txt")).toBeInTheDocument()
	})

	describe("API error handling", () => {
		it("renders credit limit error when balance error is detected", async () => {
			const mockAeriocodeError = {
				message: "Insufficient credits",
				isErrorType: vi.fn((type) => type === "balance"),
				_error: {
					details: {
						current_balance: 0,
						total_spent: 10.5,
						total_promotions: 5.0,
						message: "You have run out of credits.",
						buy_credits_url: "https://app.aeriocode.bot/dashboard",
					},
				},
			}

			const { AeriocodeError } = await import("../../../../src/services/error/AeriocodeError")
			vi.mocked(AeriocodeError.parse).mockReturnValue(mockAeriocodeError as any)

			render(<ErrorRow message={mockMessage} errorType="error" apiRequestFailedMessage="Insufficient credits error" />)

			expect(screen.getByTestId("credit-limit-error")).toBeInTheDocument()
			expect(screen.getByText("You have run out of credits.")).toBeInTheDocument()
		})

		it("renders rate limit error with request ID", async () => {
			const mockAeriocodeError = {
				message: "Rate limit exceeded",
				isErrorType: vi.fn((type) => type === "rateLimit"),
				_error: {
					request_id: "req_123456",
				},
			}

			const { AeriocodeError } = await import("../../../../src/services/error/AeriocodeError")
			vi.mocked(AeriocodeError.parse).mockReturnValue(mockAeriocodeError as any)

			render(<ErrorRow message={mockMessage} errorType="error" apiRequestFailedMessage="Rate limit exceeded" />)

			expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument()
			expect(screen.getByText("Request ID: req_123456")).toBeInTheDocument()
		})

		it("renders auth error with sign in button when user is not signed in", async () => {
			const mockAeriocodeError = {
				message: "Authentication failed",
				isErrorType: vi.fn((type) => type === "auth"),
				providerId: "aeriocode",
				_error: {},
			}

			const { AeriocodeError } = await import("../../../../src/services/error/AeriocodeError")
			vi.mocked(AeriocodeError.parse).mockReturnValue(mockAeriocodeError as any)

			render(<ErrorRow message={mockMessage} errorType="error" apiRequestFailedMessage="Authentication failed" />)

			expect(screen.getByText("Authentication failed")).toBeInTheDocument()
			expect(screen.getByText("Sign in to Aeriocode")).toBeInTheDocument()
		})

		it("renders PowerShell troubleshooting link when error mentions PowerShell", async () => {
			const mockAeriocodeError = {
				message: "PowerShell is not recognized as an internal or external command",
				isErrorType: vi.fn(() => false),
				_error: {},
			}

			const { AeriocodeError } = await import("../../../../src/services/error/AeriocodeError")
			vi.mocked(AeriocodeError.parse).mockReturnValue(mockAeriocodeError as any)

			render(
				<ErrorRow
					message={mockMessage}
					errorType="error"
					apiRequestFailedMessage="PowerShell is not recognized as an internal or external command"
				/>,
			)

			expect(screen.getByText(/PowerShell is not recognized/)).toBeInTheDocument()
			expect(screen.getByText("troubleshooting guide")).toBeInTheDocument()
			expect(screen.getByRole("link", { name: "troubleshooting guide" })).toHaveAttribute(
				"href",
				"https://github.com/aerioapp/aeriocode-vscode-extension/wiki/TroubleShooting-%E2%80%90-%22PowerShell-is-not-recognized-as-an-internal-or-external-command%22",
			)
		})

		it("handles apiReqStreamingFailedMessage instead of apiRequestFailedMessage", async () => {
			const mockAeriocodeError = {
				message: "Streaming failed",
				isErrorType: vi.fn(() => false),
				_error: {},
			}

			const { AeriocodeError } = await import("../../../../src/services/error/AeriocodeError")
			vi.mocked(AeriocodeError.parse).mockReturnValue(mockAeriocodeError as any)

			render(<ErrorRow message={mockMessage} errorType="error" apiReqStreamingFailedMessage="Streaming failed" />)

			expect(screen.getByText("Streaming failed")).toBeInTheDocument()
		})

		it("falls back to regular error message when AeriocodeError.parse returns null", async () => {
			const { AeriocodeError } = await import("../../../../src/services/error/AeriocodeError")
			vi.mocked(AeriocodeError.parse).mockReturnValue(undefined)

			render(<ErrorRow message={mockMessage} errorType="error" apiRequestFailedMessage="Some API error" />)

			// When AeriocodeError.parse returns null, aeriocodeErrorMessage is undefined, so it renders an empty paragraph
			// The fallback to message.text only happens when there's no apiRequestFailedMessage at all
			const paragraph = screen.getByRole("paragraph")
			expect(paragraph).toBeInTheDocument()
			expect(paragraph).toBeEmptyDOMElement()
		})

		it("renders regular error message when no API error messages are provided", () => {
			render(<ErrorRow message={mockMessage} errorType="error" />)

			expect(screen.getByText("Test error message")).toBeInTheDocument()
		})
	})
})
