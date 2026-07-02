import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { handleSignIn } from "@/context/AeriocodeAuthContext"
import AeriocodeLogoWhite from "../../assets/AeriocodeLogoWhite"

export const AccountWelcomeView = () => (
	<div className="flex flex-col items-center pr-3">
		<AeriocodeLogoWhite className="size-16 mb-4" />

		<p>
			AerioCode is an AI-powered coding assistant specifically designed for DO-178C compliant aviation software development.
			Sign in to access advanced AI models, safety analysis tools, automated documentation generation, and comprehensive
			development features tailored for aerospace engineering.
		</p>

		<VSCodeButton onClick={() => handleSignIn()} className="w-full mb-4">
			Sign in with AerioCode
		</VSCodeButton>

		<p className="text-[var(--vscode-descriptionForeground)] text-xs text-center m-0">
			By continuing, you agree to the <VSCodeLink href="http://localhost:4075/tos">Terms of Service</VSCodeLink> and{" "}
			<VSCodeLink href="http://localhost:4075/privacy">Privacy Policy.</VSCodeLink>
		</p>
	</div>
)
