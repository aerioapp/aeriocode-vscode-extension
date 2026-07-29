import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
	ApplyComplianceFixesRequest,
	ComplianceScope,
	ListComplianceFilesRequest,
	RunComplianceCheckRequest,
	type ComplianceCheckResponse,
	type ComplianceFile,
	type ComplianceStandard,
} from "@shared/proto/aeriocode/compliance"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { ComplianceServiceClient } from "@/services/grpc-client"
import ComplianceFileList from "./ComplianceFileList"
import ComplianceResults from "./ComplianceResults"

type ComplianceViewProps = {
	onDone: () => void
}

const SCOPES: Array<{ value: ComplianceScope; label: string; hint: string }> = [
	{ value: ComplianceScope.COMPLIANCE_SCOPE_ACTIVE_FILE, label: "Active file", hint: "The file in the editor" },
	{ value: ComplianceScope.COMPLIANCE_SCOPE_OPEN_EDITORS, label: "Open editors", hint: "Every open tab" },
	{ value: ComplianceScope.COMPLIANCE_SCOPE_ACTIVE_FOLDER, label: "Current folder", hint: "Siblings of the active file" },
	{ value: ComplianceScope.COMPLIANCE_SCOPE_WORKSPACE, label: "Whole workspace", hint: "Every source file" },
]

/**
 * The compliance panel.
 *
 * Scope presets rather than a file tree: the common case is "check what I am looking at",
 * and a tree would make that slower while mostly offering files the request cannot accept
 * (the backend caps a check at 50 files / 2 MB). The preset resolves to a concrete
 * checklist, so the user still gets per-file control — and can see exactly which files
 * leave their machine before they do.
 */
const ComplianceView = ({ onDone }: ComplianceViewProps) => {
	const [standards, setStandards] = useState<ComplianceStandard[]>([])
	const [standardId, setStandardId] = useState<string>("")
	const [standardsError, setStandardsError] = useState("")
	const [loadingStandards, setLoadingStandards] = useState(true)

	const [scope, setScope] = useState<ComplianceScope>(ComplianceScope.COMPLIANCE_SCOPE_ACTIVE_FILE)
	const [files, setFiles] = useState<ComplianceFile[]>([])
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [scopeLabel, setScopeLabel] = useState("")
	const [emptyReason, setEmptyReason] = useState("")
	const [excludedOverLimit, setExcludedOverLimit] = useState(0)
	const [maxFiles, setMaxFiles] = useState(50)
	const [loadingFiles, setLoadingFiles] = useState(false)

	const [result, setResult] = useState<ComplianceCheckResponse | null>(null)
	const [runError, setRunError] = useState("")
	const [running, setRunning] = useState(false)
	const [fixing, setFixing] = useState(false)
	const [fixNotice, setFixNotice] = useState("")

	const standard = useMemo(() => standards.find((entry) => entry.id === standardId), [standards, standardId])

	useEffect(() => {
		let cancelled = false

		ComplianceServiceClient.getComplianceStandards(EmptyRequest.create({}))
			.then((response) => {
				if (cancelled) {
					return
				}
				setStandards(response.standards)
				setStandardsError(response.error)
				if (response.standards.length > 0) {
					setStandardId(response.standards[0].id)
				}
			})
			.catch((error) => {
				if (!cancelled) {
					setStandardsError(error?.message ?? "Could not load compliance standards.")
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoadingStandards(false)
				}
			})

		return () => {
			cancelled = true
		}
	}, [])

	const refreshFiles = useCallback(() => {
		if (!standardId) {
			return
		}
		setLoadingFiles(true)
		setFixNotice("")

		ComplianceServiceClient.listComplianceFiles(ListComplianceFilesRequest.create({ scope, standard: standardId }))
			.then((response) => {
				setFiles(response.files)
				setScopeLabel(response.scopeLabel)
				setEmptyReason(response.emptyReason)
				setExcludedOverLimit(response.excludedOverLimit)
				setMaxFiles(response.maxFiles || 50)
				// Everything the user is allowed to check starts selected — the list is a
				// confirmation step, not a chore.
				setSelected(new Set(response.files.filter((file) => file.selectable).map((file) => file.path)))
			})
			.catch((error) => {
				setFiles([])
				setEmptyReason(error?.message ?? "Could not list files.")
			})
			.finally(() => setLoadingFiles(false))
	}, [scope, standardId])

	useEffect(() => {
		refreshFiles()
	}, [refreshFiles])

	const toggle = useCallback((path: string) => {
		setSelected((previous) => {
			const next = new Set(previous)
			if (next.has(path)) {
				next.delete(path)
			} else {
				next.add(path)
			}
			return next
		})
	}, [])

	// Returns the fresh result so a caller that triggered the run (autofix) can describe
	// the outcome. Deliberately does NOT clear fixNotice: the autofix flow re-runs the
	// check immediately, and wiping the notice here erased the only record that files had
	// just been modified. Callers that start a genuinely new check clear it themselves.
	const run = useCallback((): Promise<ComplianceCheckResponse | null> => {
		setRunning(true)
		setRunError("")

		return ComplianceServiceClient.runComplianceCheck(
			RunComplianceCheckRequest.create({ standard: standardId, paths: [...selected] }),
		)
			.then((response) => {
				if (response.error) {
					setRunError(response.error)
					setResult(null)
					return null
				}
				setResult(response)
				return response
			})
			.catch((error) => {
				setRunError(error?.message ?? "The compliance check failed.")
				return null
			})
			.finally(() => setRunning(false))
	}, [standardId, selected])

	const startCheck = useCallback(() => {
		setFixNotice("")
		void run()
	}, [run])

	const applyFixes = useCallback(
		(tier: "safe" | "review") => {
			setFixing(true)
			setFixNotice("")

			ComplianceServiceClient.applyComplianceFixes(
				ApplyComplianceFixesRequest.create({ standard: standardId, paths: [...selected], tier, ruleIds: [] }),
			)
				.then(async (response) => {
					if (response.error) {
						setFixNotice(response.error)
						return
					}
					if (response.filesChanged === 0) {
						setFixNotice("No fixes were applied — the remaining violations need a human decision.")
						return
					}

					const changed = response.files.filter((file) => file.changed)
					const written = `Applied ${response.fixesApplied} fix(es) to ${changed.map((file) => file.path).join(", ")}.`
					setFixNotice(`${written} Re-checking…`)

					// State the outcome once the re-check lands. Without this the buttons simply
					// disappear when nothing is left to fix, leaving no evidence anything happened.
					const rechecked = await run()
					if (!rechecked?.summary) {
						setFixNotice(`${written} Files were saved; re-run the check to see the current state.`)
						return
					}

					const stillFixable = rechecked.findings.filter((finding) => finding.fixable).length
					const remaining = rechecked.summary.totalFindings
					setFixNotice(
						remaining === 0
							? `${written} No violations remain.`
							: stillFixable === 0
								? `${written} ${remaining} finding(s) remain, none of which can be fixed automatically.`
								: `${written} ${remaining} finding(s) remain, ${stillFixable} still fixable.`,
					)
				})
				.catch((error) => setFixNotice(error?.message ?? "Applying fixes failed."))
				.finally(() => setFixing(false))
		},
		[standardId, selected, run],
	)

	const fixableSafe = useMemo(() => (result?.findings ?? []).filter((finding) => finding.fixable === "safe").length, [result])
	const fixableReview = useMemo(
		() => (result?.findings ?? []).filter((finding) => finding.fixable === "review").length,
		[result],
	)

	const busy = running || fixing

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden pt-[10px] pl-[20px]">
			<div className="flex justify-between items-center mb-[12px] pr-[17px]">
				<h3 className="text-[var(--vscode-foreground)] m-0">Compliance Check</h3>
				<VSCodeButton onClick={onDone}>Done</VSCodeButton>
			</div>

			<div className="flex-grow overflow-auto pr-[17px] flex flex-col gap-[14px]">
				{loadingStandards ? (
					<div className="flex items-center gap-[8px] text-[12px] text-[var(--vscode-descriptionForeground)]">
						<VSCodeProgressRing className="w-[16px] h-[16px]" />
						Loading standards…
					</div>
				) : standardsError ? (
					<div className="p-[10px] border border-[var(--vscode-inputValidation-errorBorder)] rounded text-[12px] text-[var(--vscode-foreground)]">
						{standardsError}
					</div>
				) : (
					<>
						{/* Profile */}
						<div className="flex flex-col gap-[4px]">
							<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Compliance profile</label>
							<VSCodeDropdown
								value={standardId}
								onChange={(event) => {
									setStandardId((event.target as HTMLSelectElement).value)
									setResult(null)
									setFixNotice("")
								}}>
								{standards.map((entry) => (
									<VSCodeOption key={entry.id} value={entry.id}>
										{entry.name} ({entry.version})
									</VSCodeOption>
								))}
							</VSCodeDropdown>
							{standard && (
								<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[2px]">
									{standard.title} — {standard.rulesAutomated} of {standard.rulesTotal} rules checked
									automatically, {standard.rulesManualReview} need manual review.
								</p>
							)}
						</div>

						{/* Scope */}
						<div className="flex flex-col gap-[4px]">
							<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Files to check</label>
							<VSCodeDropdown
								value={String(scope)}
								onChange={(event) =>
									setScope(Number((event.target as HTMLSelectElement).value) as ComplianceScope)
								}>
								{SCOPES.map((entry) => (
									<VSCodeOption key={entry.value} value={String(entry.value)}>
										{entry.label} — {entry.hint}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
							{scopeLabel && !emptyReason && (
								<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 mt-[2px]">
									From {scopeLabel}
								</p>
							)}
						</div>

						{/* Files */}
						{loadingFiles ? (
							<div className="flex items-center gap-[8px] text-[12px] text-[var(--vscode-descriptionForeground)]">
								<VSCodeProgressRing className="w-[16px] h-[16px]" />
								Finding files…
							</div>
						) : emptyReason ? (
							<div className="text-[12px] text-[var(--vscode-descriptionForeground)]">{emptyReason}</div>
						) : (
							<ComplianceFileList
								files={files}
								selected={selected}
								onToggle={toggle}
								onSelectAll={() =>
									setSelected(new Set(files.filter((file) => file.selectable).map((file) => file.path)))
								}
								onSelectNone={() => setSelected(new Set())}
								excludedOverLimit={excludedOverLimit}
								maxFiles={maxFiles}
							/>
						)}

						{/* Actions */}
						<div className="flex items-center gap-[8px]">
							<VSCodeButton onClick={startCheck} disabled={busy || selected.size === 0}>
								{running ? "Checking…" : `Check ${selected.size} file(s)`}
							</VSCodeButton>
							<VSCodeButton appearance="secondary" onClick={refreshFiles} disabled={busy || loadingFiles}>
								Refresh
							</VSCodeButton>
						</div>

						<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0">
							Selected files are sent to Aerio for analysis, held only for the duration of the check, and then
							discarded. Requires a signed-in Aerio account.
						</p>

						{runError && (
							<div className="p-[10px] border border-[var(--vscode-inputValidation-errorBorder)] rounded text-[12px] text-[var(--vscode-foreground)]">
								{runError}
							</div>
						)}

						{/* Results */}
						{result && (
							<>
								<ComplianceResults result={result} />

								<div className="flex flex-col gap-[6px] pb-[16px]">
									{(fixableSafe > 0 || fixableReview > 0) && (
										<>
											<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
												Fixes write directly to the selected files. They land in the editor's undo stack,
												so Ctrl+Z reverts them.
											</span>
											<div className="flex gap-[8px]">
												{fixableSafe > 0 && (
													<VSCodeButton onClick={() => applyFixes("safe")} disabled={busy}>
														{fixing ? "Applying…" : `Apply ${fixableSafe} safe fix(es)`}
													</VSCodeButton>
												)}
												{fixableReview > 0 && (
													<VSCodeButton
														appearance="secondary"
														onClick={() => applyFixes("review")}
														disabled={busy}>
														{/* The review tier applies the safe fixes too, so the label says so —
														    but only while safe fixes are actually left to apply. After a safe
														    run it would otherwise advertise work that no longer exists. */}
														{fixing
															? "Applying…"
															: fixableSafe > 0
																? `Apply safe + ${fixableReview} review fix(es)`
																: `Apply ${fixableReview} review fix(es)`}
													</VSCodeButton>
												)}
											</div>
										</>
									)}

									{/* Outside the button block on purpose. When the last fixable finding is
									    resolved the buttons unmount, and a notice nested inside them vanished
									    with them — leaving no indication that files had just been written. */}
									{fixNotice && (
										<span className="text-[11px] text-[var(--vscode-foreground)]">{fixNotice}</span>
									)}

									{result.findings.length > 0 && fixableSafe === 0 && fixableReview === 0 && !fixNotice && (
										<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
											None of the remaining findings have a mechanical fix — each needs a human decision.
										</span>
									)}
								</div>
							</>
						)}
					</>
				)}
			</div>
		</div>
	)
}

export default memo(ComplianceView)
