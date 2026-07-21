import { HistoryIcon, PlusIcon, SettingsIcon, UserCircleIcon } from "lucide-react"
import { useMemo } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import HeroTooltip from "../common/HeroTooltip"

// Custom MCP Server Icon component using VSCode codicon
const McpServerIcon = ({ className, size }: { className?: string; size?: number }) => (
	<span
		className={`codicon codicon-server flex items-center ${className || ""}`}
		style={{ fontSize: size ? `${size}px` : "12.5px", marginBottom: "1px" }}
	/>
)

// Custom Link Icon using VSCode codicon
const TraceabilityIcon = ({ className, size }: { className?: string; size?: number }) => (
	<span
		className={`codicon codicon-link flex items-center ${className || ""}`}
		style={{ fontSize: size ? `${size}px` : "12.5px", marginBottom: "1px" }}
	/>
)

// Custom Audit Icon using VSCode codicon
const AuditIcon = ({ className, size }: { className?: string; size?: number }) => (
	<span
		className={`codicon codicon-history flex items-center ${className || ""}`}
		style={{ fontSize: size ? `${size}px` : "12.5px", marginBottom: "1px" }}
	/>
)

export const Navbar = () => {
	const {
		navigateToHistory,
		navigateToSettings,
		navigateToAccount,
		navigateToMcp,
		navigateToChat,
		navigateToTraceability,
		navigateToAuditTrail,
	} = useExtensionState()

	const SETTINGS_TABS = useMemo(
		() => [
			{
				id: "chat",
				name: "Chat",
				tooltip: "New Task",
				icon: PlusIcon,
				navigate: navigateToChat,
			},
			{
				id: "mcp",
				name: "MCP",
				tooltip: "MCP Servers",
				icon: McpServerIcon,
				navigate: navigateToMcp,
			},
			{
				id: "traceability",
				name: "Traceability",
				tooltip: "Traceability Matrix",
				icon: TraceabilityIcon,
				navigate: navigateToTraceability,
			},
			{
				id: "audit",
				name: "Audit",
				tooltip: "Audit Trail",
				icon: AuditIcon,
				navigate: navigateToAuditTrail,
			},
			{
				id: "history",
				name: "History",
				tooltip: "History",
				icon: HistoryIcon,
				navigate: navigateToHistory,
			},
			{
				id: "account",
				name: "Account",
				tooltip: "Account",
				icon: UserCircleIcon,
				navigate: navigateToAccount,
			},
			{
				id: "settings",
				name: "Settings",
				tooltip: "Settings",
				icon: SettingsIcon,
				navigate: navigateToSettings,
			},
		],
		[
			navigateToAccount,
			navigateToChat,
			navigateToHistory,
			navigateToMcp,
			navigateToSettings,
			navigateToTraceability,
			navigateToAuditTrail,
		],
	)

	return (
		<nav
			id="aeriocode-navbar-container"
			className="flex-none inline-flex justify-end bg-transparent gap-2 mb-1 z-10 border-none items-center mr-4!"
			style={{ gap: "4px" }}>
			{SETTINGS_TABS.map((tab) => (
				<HeroTooltip key={`navbar-tooltip-${tab.id}`} content={tab.tooltip} placement="bottom">
					<VSCodeButton
						key={`navbar-button-${tab.id}`}
						appearance="icon"
						aria-label={tab.tooltip}
						data-testid={`tab-${tab.id}`}
						onClick={() => tab.navigate()}
						style={{ padding: "0px", height: "20px" }}>
						<div className="flex items-center gap-1 text-xs whitespace-nowrap min-w-0 w-full">
							<tab.icon className="text-[var(--vscode-foreground)]" strokeWidth={1} size={18} />
						</div>
					</VSCodeButton>
				</HeroTooltip>
			))}
		</nav>
	)
}
