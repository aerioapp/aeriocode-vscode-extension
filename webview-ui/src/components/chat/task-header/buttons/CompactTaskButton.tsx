import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import HeroTooltip from "@/components/common/HeroTooltip"
import React from "react"

const CompactTaskButton: React.FC<{
	className?: string
	onClick: (e: React.MouseEvent) => void
}> = ({ onClick, className }) => {
	return (
		<HeroTooltip content="Compact Task">
			<VSCodeButton
				appearance="icon"
				aria-label="Compact Task"
				className={className}
				onClick={(e) => {
					e.preventDefault()
					e.stopPropagation()
					onClick(e)
				}}>
				<span className="codicon codicon-fold"></span>
			</VSCodeButton>
		</HeroTooltip>
	)
}

export default CompactTaskButton
