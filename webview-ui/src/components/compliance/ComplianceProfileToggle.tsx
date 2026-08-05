import { CODE_BLOCK_BG_COLOR } from "@/components/common/CodeBlock"
import Tooltip from "@/components/common/Tooltip"
import { ComplianceServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { ComplianceProfileResponse, ComplianceStandard, SetComplianceProfileRequest } from "@shared/proto/aeriocode/compliance"
import { VSCodeButton, VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import React, { useEffect, useRef, useState } from "react"
import { useClickAway, useWindowSize } from "react-use"

/**
 * The coding standard in force, shown and changed where the code is being asked for.
 *
 * ⚠️ This exists because the setting alone was not discoverable. Two real sessions ran against an
 * avionics standard the user believed was applied and was not; in the second, the model — asked why
 * its file did not comply — went looking for the standard's documentation on the web, because
 * without a profile the rules never reach the prompt at all. Nothing in the UI said the feature was
 * dormant: the status bar hid itself precisely when nothing was enforced.
 *
 * So the control sits beside the model picker, which is where a user is looking when they ask for
 * code, and it renders the off state rather than disappearing into it.
 *
 * The standards list comes from the backend rather than a constant here, so a newly published pack
 * appears without an extension release — the same reason `ComplianceService` is standard-agnostic.
 */

const DAL_LEVELS = ["A", "B", "C", "D"]
const ASIL_LEVELS = ["D", "C", "B", "A", "QM"]

const ComplianceProfileToggle: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [profile, setProfile] = useState<ComplianceProfileResponse | null>(null)
	const [standards, setStandards] = useState<ComplianceStandard[]>([])
	const [standardsError, setStandardsError] = useState("")
	const buttonRef = useRef<HTMLDivElement>(null)
	const modalRef = useRef<HTMLDivElement>(null)
	const { width: viewportWidth, height: viewportHeight } = useWindowSize()
	const [arrowPosition, setArrowPosition] = useState(0)
	const [menuPosition, setMenuPosition] = useState(0)

	useClickAway(modalRef, () => setIsVisible(false))

	// The profile is read on mount, not only when the popover opens, because the button label is the
	// thing that has to be right when nobody is looking at it.
	useEffect(() => {
		ComplianceServiceClient.getComplianceProfile({} as EmptyRequest)
			.then(setProfile)
			.catch((error) => console.error("Failed to read the compliance profile:", error))
	}, [])

	useEffect(() => {
		if (!isVisible) {
			return
		}
		// Re-read on open: the settings file is an equally valid route to this state, so the popover
		// must not show what it last wrote.
		ComplianceServiceClient.getComplianceProfile({} as EmptyRequest)
			.then(setProfile)
			.catch((error) => console.error("Failed to read the compliance profile:", error))
		ComplianceServiceClient.getComplianceStandards({} as EmptyRequest)
			.then((response) => {
				setStandards(response.standards)
				setStandardsError(response.error)
			})
			.catch((error) => setStandardsError((error as Error)?.message ?? String(error)))
	}, [isVisible])

	useEffect(() => {
		if (isVisible && buttonRef.current) {
			const rect = buttonRef.current.getBoundingClientRect()
			setArrowPosition(document.documentElement.clientWidth - (rect.left + rect.width / 2) - 5)
			setMenuPosition(rect.top + 1)
		}
	}, [isVisible, viewportWidth, viewportHeight])

	const apply = (changes: Partial<SetComplianceProfileRequest>) => {
		const next = SetComplianceProfileRequest.create({
			standard: profile?.standard ?? "",
			level: profile?.level ?? "",
			regime: profile?.regime || "do-178c",
			gateEnabled: profile?.gateEnabled ?? true,
			...changes,
		})
		ComplianceServiceClient.setComplianceProfile(next)
			// The *resolved* profile is what comes back, so a level dropped as invalid for the regime
			// shows as dropped rather than as accepted.
			.then(setProfile)
			.catch((error) => console.error("Failed to set the compliance profile:", error))
	}

	const regime = profile?.regime || "do-178c"
	const levels = regime === "iso-26262" ? ASIL_LEVELS : DAL_LEVELS
	const levelLabel = regime === "iso-26262" ? "ASIL" : "DAL"
	const active = Boolean(profile?.standard)
	// A level declared through certification setup is not editable here; it is shown, with its source.
	const fromCertification = profile?.levelSource === "certification"
	const selected = standards.find((standard) => standard.id === profile?.standard)
	// The short name where the backend has been reached, the id otherwise — the button must be right
	// before the standards list has loaded, and the id is what the settings file holds anyway.
	const buttonLabel = active
		? `${selected?.name || profile?.standard}${profile?.level ? ` ${levelLabel} ${profile.level}` : ""}`
		: "No standard"

	return (
		// `shrink-0` because this now sits after the model selector, which is `flex: 1` and will
		// otherwise take every pixel and collapse the shield to nothing in a narrow sidebar.
		<div ref={modalRef} className="shrink-0">
			<div ref={buttonRef} className="inline-flex min-w-0 max-w-full">
				<Tooltip
					tipText={
						active
							? `Holding generated code to ${selected?.name || profile?.standard}`
							: "No coding standard is being enforced"
					}
					visible={isVisible ? false : undefined}>
					<VSCodeButton
						appearance="icon"
						aria-label="Coding standard"
						onClick={() => setIsVisible(!isVisible)}
						style={{ padding: "0px 0px", height: "20px" }}>
						<div className="flex items-center gap-1 text-xs whitespace-nowrap min-w-0">
							<span
								className={`codicon codicon-shield flex items-center${active ? "" : " opacity-50"}`}
								style={{ fontSize: "12.5px", marginBottom: 1 }}
							/>
							{/* Capped rather than unbounded: the label is informative, not the point of the row,
							    and a long standard name must not push the model name out of view. */}
							{active && (
								<span className="truncate" style={{ maxWidth: "11ch" }}>
									{buttonLabel}
								</span>
							)}
						</div>
					</VSCodeButton>
				</Tooltip>
			</div>

			{isVisible && (
				// ⚠️ No `overflow-y: auto` here, unlike the sibling modals this was copied from.
				// `VSCodeDropdown` renders its listbox as a child element rather than a portal, so any
				// scrolling ancestor clips it: with room below, the list opened downward and looked
				// fine, but in a tall panel it opened *upward* and was cut off at this container's top
				// edge, showing only the last two standards. A picker that silently hides half its
				// options is worse than no picker.
				//
				// Safe to drop because this popover's content is bounded — a few rows and two short
				// paragraphs — unlike the rules modal, which lists an unbounded number of files and
				// genuinely needs to scroll.
				<div
					className="fixed left-[15px] right-[15px] border border-[var(--vscode-editorGroup-border)] p-3 rounded z-[1000]"
					style={{
						bottom: `calc(100vh - ${menuPosition}px + 6px)`,
						background: CODE_BLOCK_BG_COLOR,
					}}>
					<div
						className="fixed w-[10px] h-[10px] z-[-1] rotate-45 border-r border-b border-[var(--vscode-editorGroup-border)]"
						style={{
							bottom: `calc(100vh - ${menuPosition}px)`,
							right: arrowPosition,
							background: CODE_BLOCK_BG_COLOR,
						}}
					/>

					<div className="text-sm font-bold mb-2">Coding standard</div>

					{profile && !profile.canPersist && (
						<div className="text-xs text-[var(--vscode-errorForeground)] mb-2">
							Open a folder to set a standard. This is stored per workspace so a certified repository and an
							everyday one can differ.
						</div>
					)}

					{/* ⚠️ Option labels are the short `name`, not `title`. A dropdown renders its selected
					    option inside a control the width of the panel, and the sidebar is routinely 300px:
					    "MISRA C++ guidelines for critical systems written in C++" is clipped to something
					    that does not identify the standard. The long form goes below, where it can wrap. */}
					<div className="mb-3">
						<VSCodeDropdown
							value={profile?.standard || ""}
							disabled={!profile?.canPersist}
							onChange={(e: any) => apply({ standard: e.target.value })}
							className="w-full"
							style={{ width: "100%", minWidth: 0 }}>
							<VSCodeOption value="">None</VSCodeOption>
							{standards.map((standard) => (
								<VSCodeOption key={standard.id} value={standard.id}>
									{standard.name || standard.id}
								</VSCodeOption>
							))}
						</VSCodeDropdown>
						{selected ? (
							<div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 break-words">
								{selected.title}
								{selected.rulesTotal > 0 && (
									<>
										{" "}
										· {selected.rulesAutomated} of {selected.rulesTotal} rules checked automatically
									</>
								)}
							</div>
						) : (
							<div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 break-words">
								Aeriocode behaves as an ordinary assistant. Generated code is not held to a standard and is not
								analysed.
							</div>
						)}
						{standardsError && (
							<div className="text-xs text-[var(--vscode-errorForeground)] mt-1 break-words">
								Could not load standards: {standardsError}
							</div>
						)}
					</div>

					{active && (
						<>
							{/* Stacked, not side by side. Two half-width dropdowns in a 300px sidebar leave each
							    too narrow to show "ISO 26262 (road vehicles)" at all. Full width costs one row
							    of height and works at every panel size. */}
							<div className="mb-3">
								<div className="text-xs mb-1">Regime</div>
								<VSCodeDropdown
									value={regime}
									disabled={fromCertification}
									onChange={(e: any) => apply({ regime: e.target.value, level: "" })}
									className="w-full"
									style={{ width: "100%", minWidth: 0 }}>
									<VSCodeOption value="do-178c">DO-178C — airborne</VSCodeOption>
									<VSCodeOption value="iso-26262">ISO 26262 — road vehicles</VSCodeOption>
								</VSCodeDropdown>
								{/* ⚠️ Selecting ISO 26262 does strictly less than DO-178C, and saying so is the
								    difference between a limitation and a surprise. Aerio holds no copy of ISO
								    26262 and asserts no mapping from these rules to ASILs, so the applicability
								    map ships declared-empty rather than guessed — the same discipline as
								    `pending-source-verification` on the MISRA packs. The certification module is
								    DO-178C only, which the user sees as an inconsistency between two screens
								    unless the narrower one explains itself. */}
								{regime === "iso-26262" && (
									<div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 break-words">
										ASIL applicability is not yet determined, so the standard is applied in full rather than
										graded by level. Certification artifacts — objective tables, document drafts — are DO-178C
										only.
									</div>
								)}
							</div>
							{/* ⚠️ When a certification profile is active it *is* the assurance level — the same
							    value the certification screen shows, resolved from one place. Offering an
							    editable copy here was the defect a user reported: that screen said DAL A while
							    this one said the level was unset, and nothing told them which the model was
							    actually held to. */}
							<div className="mb-3">
								<div className="text-xs mb-1">{levelLabel}</div>
								{fromCertification ? (
									<>
										<div className="text-[13px] text-[var(--vscode-foreground)]">
											{levelLabel} {profile?.level}
										</div>
										<div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 break-words">
											Declared by the active certification profile. Change it in Settings → Certification so
											the coding standard and the certification record cannot disagree.
										</div>
									</>
								) : (
									<VSCodeDropdown
										value={profile?.level || ""}
										onChange={(e: any) => apply({ level: e.target.value })}
										className="w-full"
										style={{ width: "100%", minWidth: 0 }}>
										<VSCodeOption value="">Not set</VSCodeOption>
										{levels.map((level) => (
											<VSCodeOption key={level} value={level}>
												{levelLabel} {level}
											</VSCodeOption>
										))}
									</VSCodeDropdown>
								)}
							</div>

							<div className="mb-2">
								<VSCodeCheckbox
									checked={profile?.gateEnabled ?? true}
									onChange={(e: any) => apply({ gateEnabled: e.target.checked })}>
									Check generated code after every write
								</VSCodeCheckbox>
								<div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
									Turning this off leaves the model told to follow the standard with nothing checking that it
									did.
								</div>
							</div>

							{/* The level is a claim about how much assurance the software needs, so it is worth saying
							    plainly where it should come from. Choosing it for convenience is the failure mode. */}
							<div className="text-xs text-[var(--vscode-descriptionForeground)] mb-2">
								Set the {levelLabel} from your system safety assessment, not for convenience. Leaving it unset
								applies the standard in full, which is the stricter reading.
							</div>
						</>
					)}

					{/* Required by the claim audit: Aerio reports findings and never asserts compliance or
					    certification, on any surface. */}
					<div className="text-xs text-[var(--vscode-descriptionForeground)] border-t border-[var(--vscode-panel-border)] pt-2">
						Aerio reports findings against the standard. This is not a certification and does not guarantee one —
						whether the evidence suffices is decided by the applicant and their certification authority.
					</div>
				</div>
			)}
		</div>
	)
}

export default ComplianceProfileToggle
