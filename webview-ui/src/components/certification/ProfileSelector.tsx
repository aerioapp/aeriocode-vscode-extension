import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { memo, useState } from "react"

type ProfileSelectorProps = {
	currentStandard: string | null
	currentLevel: string | null
	onSelect: (standard: string, level: string) => void
	onCancel: () => void
}

const STANDARDS = [
	{
		name: "DO-178C",
		description: "Software Considerations in Airborne Systems and Equipment Certification",
		levels: [
			{ id: "DAL_A", label: "DAL A", failure_condition: "Catastrophic" },
			{ id: "DAL_B", label: "DAL B", failure_condition: "Hazardous" },
			{ id: "DAL_C", label: "DAL C", failure_condition: "Major" },
			{ id: "DAL_D", label: "DAL D", failure_condition: "Minor" },
		],
	},
	// Future: ISO-26262, IEC-62304, IEC-61508
]

const ProfileSelector = ({ currentStandard, currentLevel, onSelect, onCancel }: ProfileSelectorProps) => {
	const [selectedStandard, setSelectedStandard] = useState(currentStandard || "DO-178C")
	const [selectedLevel, setSelectedLevel] = useState(currentLevel || "DAL_A")

	const standard = STANDARDS.find((s) => s.name === selectedStandard)
	const levels = standard?.levels || []

	return (
		<div className="flex flex-col gap-[16px]">
			<h4 className="text-[13px] text-[var(--vscode-foreground)] m-0">Select Certification Profile</h4>

			{/* Standard Selection */}
			<div className="flex flex-col gap-[4px]">
				<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Standard</label>
				<VSCodeDropdown
					value={selectedStandard}
					onChange={(e) => {
						setSelectedStandard((e.target as HTMLSelectElement).value)
						setSelectedLevel("") // Reset level when standard changes
					}}>
					{STANDARDS.map((s) => (
						<VSCodeOption key={s.name} value={s.name}>
							{s.name}
						</VSCodeOption>
					))}
				</VSCodeDropdown>
				{standard && (
					<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[4px]">{standard.description}</p>
				)}
			</div>

			{/* Level Selection */}
			<div className="flex flex-col gap-[4px]">
				<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Level</label>
				<VSCodeDropdown value={selectedLevel} onChange={(e) => setSelectedLevel((e.target as HTMLSelectElement).value)}>
					{levels.map((l) => (
						<VSCodeOption key={l.id} value={l.id}>
							{l.label} ({l.failure_condition})
						</VSCodeOption>
					))}
				</VSCodeDropdown>
			</div>

			{/* Actions */}
			<div className="flex gap-[8px] justify-end mt-[8px]">
				<VSCodeButton appearance="secondary" onClick={onCancel}>
					Cancel
				</VSCodeButton>
				<VSCodeButton onClick={() => onSelect(selectedStandard, selectedLevel)} disabled={!selectedLevel}>
					Activate Profile
				</VSCodeButton>
			</div>
		</div>
	)
}

export default memo(ProfileSelector)
