import { memo } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { AeriocodeMessage } from "@shared/ExtensionMessage"
import { AeriocodeError, AeriocodeErrorType } from "../../../../src/services/error/AeriocodeError"
import CreditLimitError from "@/components/chat/CreditLimitError"
import { handleSignIn, useAeriocodeAuth } from "@/context/AeriocodeAuthContext"

const errorColor = "var(--vscode-errorForeground)"

interface ErrorRowProps {
	message: AeriocodeMessage
	errorType: "error" | "mistake_limit_reached" | "auto_approval_max_req_reached" | "diff_error" | "aeriocodeignore_error"
	apiRequestFailedMessage?: string
	apiReqStreamingFailedMessage?: string
}

const ErrorRow = memo(({ message, errorType, apiRequestFailedMessage, apiReqStreamingFailedMessage }: ErrorRowProps) => {
	const { aeriocodeUser } = useAeriocodeAuth()

	const renderErrorContent = () => {
		switch (errorType) {
			case "error":
			case "mistake_limit_reached":
			case "auto_approval_max_req_reached":
				// Handle API request errors with special error parsing
				if (apiRequestFailedMessage || apiReqStreamingFailedMessage) {
					const aeriocodeError = AeriocodeError.parse(apiRequestFailedMessage || apiReqStreamingFailedMessage)
					const aeriocodeErrorMessage = aeriocodeError?.message
					const requestId = aeriocodeError?._error?.request_id
					const isAeriocodeProvider = aeriocodeError?.providerId === "aeriocode"

					if (aeriocodeError) {
						if (aeriocodeError.isErrorType(AeriocodeErrorType.Balance)) {
							const errorDetails = aeriocodeError._error?.details
							return (
								<CreditLimitError
									currentBalance={errorDetails?.current_balance}
									totalSpent={errorDetails?.total_spent}
									totalPromotions={errorDetails?.total_promotions}
									message={errorDetails?.message}
									// buyCreditsUrl={errorDetails?.buy_credits_url}
								/>
							)
						}
					}

					if (aeriocodeError?.isErrorType(AeriocodeErrorType.RateLimit)) {
						return (
							<p className="m-0 whitespace-pre-wrap text-[var(--vscode-errorForeground)] wrap-anywhere">
								{aeriocodeErrorMessage}
								{requestId && <div>Request ID: {requestId}</div>}
							</p>
						)
					}

					// Default error display
					return (
						<p className="m-0 whitespace-pre-wrap text-[var(--vscode-errorForeground)] wrap-anywhere">
							{aeriocodeErrorMessage}
							{requestId && <div>Request ID: {requestId}</div>}
							{aeriocodeErrorMessage?.toLowerCase()?.includes("powershell") && (
								<>
									<br />
									<br />
									It seems like you're having Windows PowerShell issues, please see this{" "}
									<a
										href="https://github.com/aerioapp/aeriocode-vscode-extension/wiki/TroubleShooting-%E2%80%90-%22PowerShell-is-not-recognized-as-an-internal-or-external-command%22"
										className="underline text-inherit">
										troubleshooting guide
									</a>
									.
								</>
							)}
							{aeriocodeError?.isErrorType(AeriocodeErrorType.Auth) && (
								<>
									<br />
									<br />
									{/* The user is signed in or not using aeriocode provider */}
									{aeriocodeUser && !isAeriocodeProvider ? (
										<span className="mb-4 text-[var(--vscode-descriptionForeground)]">
											(Click "Retry" below)
										</span>
									) : (
										<VSCodeButton onClick={handleSignIn} className="w-full mb-4">
											Sign in to Aeriocode
										</VSCodeButton>
									)}
								</>
							)}
						</p>
					)
				}

				// Regular error message
				return (
					<p className="m-0 whitespace-pre-wrap text-[var(--vscode-errorForeground)] wrap-anywhere">{message.text}</p>
				)

			case "diff_error":
				return (
					<div className="flex flex-col p-2 rounded text-xs opacity-80 bg-[var(--vscode-textBlockQuote-background)] text-[var(--vscode-foreground)]">
						<div>The model used search patterns that don't match anything in the file. Retrying...</div>
					</div>
				)

			case "aeriocodeignore_error":
				return (
					<div className="flex flex-col p-2 rounded text-xs bg-[var(--vscode-textBlockQuote-background)] text-[var(--vscode-foreground)] opacity-80">
						<div>
							Aeriocode tried to access <code>{message.text}</code> which is blocked by the{" "}
							<code>.aeriocodeignore</code>
							file.
						</div>
					</div>
				)

			default:
				return null
		}
	}

	// For diff_error and aeriocodeignore_error, we don't show the header separately
	if (errorType === "diff_error" || errorType === "aeriocodeignore_error") {
		return <>{renderErrorContent()}</>
	}

	// For other error types, show header + content
	return <>{renderErrorContent()}</>
})

export default ErrorRow
