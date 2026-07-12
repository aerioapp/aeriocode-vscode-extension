import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

type ViewHeaderProps = {
	title: string
	onDone: () => void
	showEnvironmentSuffix?: boolean
	environment?: string
}

const ViewHeader = ({ title, onDone, showEnvironmentSuffix, environment }: ViewHeaderProps) => {
	const showSubtext = showEnvironmentSuffix && environment && environment !== "production"

	return (
		<div className="flex justify-between items-center py-2.5 px-5 mb-[17px]">
			<div className="relative">
				<h3 className="m-0 text-lg font-normal" style={{ color: "var(--vscode-foreground)" }}>
					{title}
				</h3>
				{showSubtext && (
					<span className="absolute left-0 top-8 -translate-y-1 text-xs text-[var(--vscode-descriptionForeground)] whitespace-nowrap">
						{environment} environment
					</span>
				)}
			</div>
			<VSCodeButton onClick={onDone}>Done</VSCodeButton>
		</div>
	)
}

export default ViewHeader
