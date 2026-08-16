import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { CertificationProfile } from "@shared/proto/aeriocode/certification"
import { COMPLIANCE_REGIMES, type ComplianceRegime } from "@shared/compliance/regimes"
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useMemo, useState } from "react"

/**
 * Choosing a certification profile and the level within it.
 *
 * ⚠️ **The profile list is fetched, not declared here.** This component held its own `STANDARDS`
 * array — DO-178C with four hardcoded DAL entries and a `// Future: ISO-26262, IEC-62304, IEC-61508`
 * comment — which made it a fifth private copy of profile data and, more to the point, meant the
 * certification screen offered only DO-178C **after ECSS and NASA profiles existed and worked**. The
 * `getAvailableProfiles` RPC and its controller were already there; nothing called them.
 *
 * So the failure was not that the profiles were missing. It was that a screen was answering from a
 * constant while the system it describes had moved on, and nothing could notice — the same shape as
 * the four regime copies this codebase has already had to collapse.
 */

/**
 * Join a document id with its revision without repeating a revision letter the id already carries.
 *
 * "NPR 7150.2D" with revision "D" is one document, not "NPR 7150.2D D"; the same applies to
 * "DO-178C" / "C" and "NASA-STD-8739.8B" / "B (approved 2022-09-08)". Only the leading token is
 * considered, so any remaining detail in the revision is kept.
 */
export function documentLabel(id: string, revision?: string | null): string {
	const trimmed = (revision ?? "").trim()
	if (trimmed === "") {
		return id
	}

	const [first, ...rest] = trimmed.split(/\s+/)
	if (!id.toLowerCase().endsWith(first.toLowerCase())) {
		return `${id} ${trimmed}`
	}

	const remainder = rest.join(" ")
	return remainder === "" ? id : `${id} ${remainder}`
}

type ProfileSelectorProps = {
	currentStandard: string | null
	currentLevel: string | null
	onSelect: (standard: string, level: string) => void
	onCancel: () => void
}

const ProfileSelector = ({ currentStandard, currentLevel, onSelect, onCancel }: ProfileSelectorProps) => {
	const [profiles, setProfiles] = useState<CertificationProfile[]>([])
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(true)
	const [selectedStandard, setSelectedStandard] = useState(currentStandard || "")
	const [selectedLevel, setSelectedLevel] = useState(currentLevel || "")

	useEffect(() => {
		CertificationServiceClient.getAvailableProfiles({} as EmptyRequest)
			.then((response) => {
				setProfiles(response.profiles)
				// Default to what is active, else the first profile offered — never to a hardcoded
				// name, which would select a profile that may not be in the list.
				setSelectedStandard((current) => current || response.profiles[0]?.standard || "")
			})
			.catch((e) => setError((e as Error)?.message ?? String(e)))
			.finally(() => setLoading(false))
	}, [])

	const standard = useMemo(() => profiles.find((p) => p.standard === selectedStandard), [profiles, selectedStandard])
	const levels = standard?.levels ?? []
	const level = levels.find((l) => l.id === selectedLevel)

	// A level id belongs to one profile — `DAL_A` is not a level of the NASA profile. Switching
	// standard has to clear it, or Activate would send a pair the backend cannot resolve.
	useEffect(() => {
		if (selectedLevel && !levels.some((l) => l.id === selectedLevel)) {
			setSelectedLevel("")
		}
	}, [levels, selectedLevel])

	return (
		<div className="flex flex-col gap-[16px]">
			<h4 className="text-[13px] text-[var(--vscode-foreground)] m-0">Select Certification Profile</h4>

			{loading && <p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0">Loading profiles…</p>}
			{error && (
				<p className="text-[11px] text-[var(--vscode-errorForeground)] m-0">
					Could not load certification profiles: {error}
				</p>
			)}

			{!loading && !error && profiles.length === 0 && (
				<p className="text-[11px] text-[var(--vscode-errorForeground)] m-0">
					No certification profiles are available. This is a defect rather than a configuration — please report it.
				</p>
			)}

			{profiles.length > 0 && (
				<>
					<div className="flex flex-col gap-[4px]">
						<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Standard</label>
						<VSCodeDropdown
							value={selectedStandard}
							onChange={(e) => {
								setSelectedStandard((e.target as HTMLSelectElement).value)
								setSelectedLevel("")
							}}>
							{profiles.map((p) => (
								<VSCodeOption key={p.standard} value={p.standard}>
									{documentLabel(p.standard, p.version)}
								</VSCodeOption>
							))}
						</VSCodeDropdown>
						{standard && (
							<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[4px]">
								{standard.title ? `${standard.title} · ` : ""}
								{standard.publisher}
							</p>
						)}
						{/* The source-document list is deliberately not rendered. `basedOn` still carries the
						    publications each profile is built from, and it stays available to the profile
						    loader, but naming them here alongside a summary of what each contributes puts a
						    description of another publisher's copyrighted text in our UI. DO-178C and DO-330
						    are the pointed case: RTCA licenses those per seat. Users are told which regime
						    they have selected, which is what they need to choose. */}
					</div>

					<div className="flex flex-col gap-[4px]">
						{/* ⚠️ The regime's own word, from the profile. Three of these regimes label a level
						    "A" and mean different things by it, so calling a NASA class a "Level" — or
						    worse, a DAL — states a classification nobody made. */}
						<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">
							{levelWordFor(standard?.regime)}
						</label>
						<VSCodeDropdown
							value={selectedLevel}
							onChange={(e) => setSelectedLevel((e.target as HTMLSelectElement).value)}>
							<VSCodeOption value="">Select…</VSCodeOption>
							{levels.map((l) => (
								<VSCodeOption key={l.id} value={l.id}>
									{l.label}
									{l.failureCondition ? ` (${l.failureCondition})` : ""}
								</VSCodeOption>
							))}
						</VSCodeDropdown>
						{/* The long form goes here, where it can wrap, rather than inline in an option. */}
						{level?.assignedFrom && (
							<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[4px] break-words">
								{level.assignedFrom}
							</p>
						)}
						{level?.coverageMetric && (
							<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 break-words">
								Structural coverage: {level.coverageMetric}
							</p>
						)}
					</div>

					{standard?.levelBasis && (
						<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 break-words">
							Defined by {standard.levelBasis}.
						</p>
					)}

					{/* ⚠️ Disclosure on the screen where the choice is made, not after it. A programme
					    selecting ECSS or NASA gets the coding standard, the analysis and the audit trail
					    and does not get an objectives dashboard for its own regime — because neither
					    publisher organises around one, and projecting DO-178C's grid onto them would
					    invent a structure they do not use. Meeting that here beats discovering it from
					    an empty view. */}
					{standard?.unsupportedArtifacts && standard.unsupportedArtifacts.length > 0 && (
						<div className="flex flex-col gap-[4px] border-t border-[var(--vscode-panel-border)] pt-[8px]">
							<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
								Not produced for this profile:
							</span>
							<ul className="m-0 pl-[16px] text-[11px] text-[var(--vscode-descriptionForeground)]">
								{standard.unsupportedArtifacts.map((item) => (
									<li className="break-words" key={item}>
										{item}
									</li>
								))}
							</ul>
						</div>
					)}
				</>
			)}

			<div className="flex gap-[8px] justify-end mt-[8px]">
				<VSCodeButton appearance="secondary" onClick={onCancel}>
					Cancel
				</VSCodeButton>
				<VSCodeButton
					onClick={() => onSelect(selectedStandard, selectedLevel)}
					disabled={!selectedStandard || !selectedLevel}>
					Activate Profile
				</VSCodeButton>
			</div>
		</div>
	)
}

/**
 * What the regime calls one of its levels.
 *
 * ⚠️ This was justified as "a small local map rather than importing the shared regime table, because
 * a profile can exist for a regime the coding-standard picker does not offer". **That argument does
 * not hold, and the distinction it leans on is the one `regimes.ts` calls load-bearing.**
 * `COMPLIANCE_REGIMES` is every regime this build *knows*, offered or not — `selectable` is a
 * separate field, and ISO 26262 is in the table precisely because being known and being offered are
 * different things. Importing it restricts nothing.
 *
 * What the local copy did buy was a silent wrong answer: it was a `switch` over three literals with a
 * `"Level"` default, so the fourth regime rendered as the generic word with nothing failing. That is
 * the same silence that kept ECSS out of the picker for a release.
 *
 * The fallback survives, and is still the honest answer for a profile whose regime this build does
 * not know — a project-level `.aeriocode/profile.json` is not obliged to declare one. It claims
 * nothing, where "DAL" would claim DO-178C.
 */
function levelWordFor(regime: string | undefined): string {
	// ⚠️ From the shared regime table, not a `switch` with a `"Level"` default. This was that switch,
	// and it was the fifth private copy of a table the rest of this change had just finished
	// collapsing into one — a regime added to `regimes.ts` and not here would have rendered as the
	// generic word, silently, which is the failure mode that kept ECSS out of the picker.
	//
	// A profile with no declared regime still falls back, because a project-level
	// `.aeriocode/profile.json` is not obliged to name one.
	return regime && regime in COMPLIANCE_REGIMES ? COMPLIANCE_REGIMES[regime as ComplianceRegime].levelWordLong : "Level"
}

export default memo(ProfileSelector)
