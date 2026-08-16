/**
 * How a regime status reads on screen.
 *
 * ⚠️ **Shared presentation, not a shared data shape.** The two dashboards render from different
 * messages on purpose — ECSS carries `toBeAgreed`, NASA carries `conditional`, and a common row type
 * would have dropped whichever field it did not have. What they legitimately share is how a status
 * looks: the same colour must mean the same thing on both screens, or a reader who has seen one
 * learns the wrong lesson for the other.
 *
 * So the statuses are described once and the rows stay separate.
 */

export interface StatusPresentation {
	/** Short label for the row. */
	label: string
	/** A VS Code theme colour variable. */
	color: string
	/** Codicon name, without the `codicon-` prefix. */
	icon: string
	/** What the status means, for a tooltip. Written for someone who has not read the standard. */
	meaning: string
}

/**
 * ⚠️ There is no `satisfied`, and its absence is the point rather than an omission.
 *
 * No backend dashboard emits it: satisfying an Annex A objective, an Annex R expected output or a
 * SWE requirement is a judgement made by an accountable person over a body of evidence, of which an
 * automated check is one part. Adding a green "satisfied" chip here would assert that judgement on
 * their behalf from the one layer that has least standing to make it.
 */
export const STATUS_PRESENTATION: Record<string, StatusPresentation> = {
	partial: {
		label: "Evidence recorded",
		color: "var(--vscode-testing-iconPassed)",
		icon: "circle-filled",
		meaning:
			"Aerio holds an artifact that is a genuine input to this. It is not a claim that the obligation is met — that determination is yours.",
	},
	"no-evidence": {
		label: "Nothing recorded",
		color: "var(--vscode-descriptionForeground)",
		icon: "circle-outline",
		meaning:
			"Applicable, and Aerio holds nothing toward it. Most of a certification standard is process obligation that no tool discharges, so this is the expected reading for most rows.",
	},
	"to-be-agreed": {
		label: "To be agreed",
		color: "var(--vscode-charts-yellow)",
		icon: "question",
		meaning:
			"ECSS marks this Ytba: some of what the deliverable must contain is to be agreed with the customer and measured per ECSS-Q-ST-80 clause 6.3.5.2. It is neither owed in full nor excused.",
	},
	conditional: {
		label: "Conditional",
		color: "var(--vscode-charts-yellow)",
		icon: "question",
		meaning:
			"The matrix marks this applicable at your classification, but the requirement's own text gates on a condition the matrix does not record. Whether you owe it depends on that condition.",
	},
	"not-applicable": {
		label: "Not applicable",
		color: "var(--vscode-disabledForeground)",
		icon: "dash",
		meaning: "The publisher's own tailoring says this does not apply at the selected level.",
	},
	"out-of-scope": {
		label: "Out of scope for Aerio",
		color: "var(--vscode-descriptionForeground)",
		icon: "circle-slash",
		meaning:
			"Applicable to you, and outside what a development tool can contribute to. Aerio says so rather than leaving it looking merely unstarted.",
	},
}

/** The presentation for a status, or a visibly unknown one rather than a plausible default. */
export function presentationFor(status: string): StatusPresentation {
	return (
		STATUS_PRESENTATION[status] ?? {
			label: status || "unknown",
			color: "var(--vscode-testing-iconFailed)",
			// ⚠️ Loud rather than graceful. A status this build does not recognise means the backend is
			// ahead of the webview, and rendering it as a neutral grey dot would file a state nobody has
			// interpreted under "nothing recorded" — the one reading that is always safe-looking.
			icon: "warning",
			meaning: `This build does not recognise the status "${status}". Update the extension: the backend is reporting something this screen cannot interpret.`,
		}
	)
}
