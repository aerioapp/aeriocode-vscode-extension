import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { VSCodeDropdown, VSCodeOption, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"
import { VerificationServiceClient } from "@/services/grpc-client"
import { StringRequest } from "@shared/proto/aeriocode/common"
import type { EcssOutputStatusResponse, NasaRequirementStatusResponse } from "@shared/proto/aeriocode/verification"
import { COMPLIANCE_REGIMES, levelLetterOf, regimeForProfileStandard } from "@shared/compliance/regimes"
import { presentationFor } from "./regimeStatusPresentation"

/**
 * The certification status view for whichever regime the active profile belongs to.
 *
 * ⚠️ **Two fetches and two tables, chosen by regime — not one table fed by a regime-agnostic call.**
 * The publishers do not organise around the same thing, and the fields that differ are the ones that
 * matter most: ECSS's Ytba rows are neither owed nor excused until supplier and customer agree what
 * they contain, and NASA's SWE-219 and SWE-220 apply only where the project has identified
 * safety-critical software. A shared `{id, applicable}` row would have rendered both as plain
 * "applicable", which is a different claim about what the programme owes.
 *
 * ⚠️ **DO-178C is not handled here.** Annex A is an objective grid carrying independence marks, and
 * its dashboard is a third shape again; this component covers the two regimes that had no view at
 * all. Sending a DO-178C profile through an ECSS-shaped table would be exactly the flattening the
 * paragraph above refuses.
 */

type Regime = "ecss" | "nasa"

interface RegimeStatusDashboardProps {
	/** The active certification profile's `standard`, e.g. `ECSS-E-ST-40C` or `NPR-7150.2D`. */
	profileStandard: string
	/** The active profile's level id, e.g. `CAT_B` or `CLASS_D`. */
	profileLevel: string
}

const Chip = ({ status }: { status: string }) => {
	const { color, icon, label, meaning } = presentationFor(status)
	return (
		<span className="inline-flex items-center gap-[4px] whitespace-nowrap" style={{ color }} title={meaning}>
			<span className={`codicon codicon-${icon}`} />
			<span className="text-[11px]">{label}</span>
		</span>
	)
}

const Count = ({ label, value, hint }: { label: string; value: number; hint?: string }) => (
	<div className="flex flex-col" title={hint}>
		<span className="text-[16px] text-[var(--vscode-foreground)]">{value}</span>
		<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">{label}</span>
	</div>
)

const RegimeStatusDashboard = ({ profileStandard, profileLevel }: RegimeStatusDashboardProps) => {
	const known = regimeForProfileStandard(profileStandard)
	// ⚠️ Narrowed to the two regimes this component renders, not merely to "a regime was recognised".
	// The first version guarded on `!regime`, which is truthy for `do-178c` — so a DO-178C profile
	// fell straight through to the level dropdown and rendered "DAL A" over an empty expected-output
	// table that nothing had fetched. Annex A is a third shape and belongs to its own view.
	const regime: Regime | null = known === "ecss" || known === "nasa" ? known : null
	const [level, setLevel] = useState(() => levelLetterOf(profileLevel))
	const [ecss, setEcss] = useState<EcssOutputStatusResponse | null>(null)
	const [nasa, setNasa] = useState<NasaRequirementStatusResponse | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")

	// The activated profile is the default, and re-selecting follows it if it changes underneath.
	useEffect(() => setLevel(levelLetterOf(profileLevel)), [profileLevel])

	const load = useCallback(async (regimeId: Regime, forLevel: string) => {
		setLoading(true)
		setError("")
		try {
			if (regimeId === "ecss") {
				const response = await VerificationServiceClient.getEcssOutputStatus(StringRequest.create({ value: forLevel }))
				setEcss(response)
				setError(response.error || "")
			} else {
				const response = await VerificationServiceClient.getNasaRequirementStatus(
					StringRequest.create({ value: forLevel }),
				)
				setNasa(response)
				setError(response.error || "")
			}
		} catch (e) {
			setError((e as Error)?.message ?? String(e))
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		if (regime) {
			void load(regime, level)
		}
	}, [regime, level, load])

	const rows = useMemo(() => {
		if (regime === "ecss") {
			return (ecss?.rows ?? []).map((row) => ({
				key: row.id,
				id: row.id,
				title: row.output,
				status: row.status,
				note: row.contributes,
				// ⚠️ Shown even where it equals the status, because "required" and "to be agreed" are
				// facts about the standard while the status is a fact about this project. A reader has
				// to be able to tell "ECSS does not ask this of you" from "you have not done it".
				force: row.force,
			}))
		}
		return (nasa?.rows ?? []).map((row) => ({
			key: row.id,
			id: row.id,
			title: `NPR 7150.2D §${row.section}`,
			status: row.status,
			note: row.condition || row.contributes,
			force: row.applicable ? "required" : "not-applicable",
		}))
	}, [regime, ecss, nasa])

	if (!regime) {
		// A DO-178C profile, or one this build does not recognise. Saying so beats an empty table,
		// which reads as "your programme owes nothing".
		return (
			<p className="text-[12px] text-[var(--vscode-descriptionForeground)] m-0">
				{profileStandard
					? `No expected-output view is available for ${profileStandard}. DO-178C programmes use the Annex A objective tables.`
					: "No certification profile is active."}
			</p>
		)
	}

	const spec = COMPLIANCE_REGIMES[regime]
	const summary = regime === "ecss" ? ecss : nasa

	return (
		<div className="flex flex-col gap-[12px]">
			<div className="flex items-end gap-[12px] flex-wrap">
				<div className="flex flex-col gap-[4px]">
					<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">{spec.levelWordLong}</label>
					<VSCodeDropdown value={level} onChange={(e) => setLevel((e.target as HTMLSelectElement).value)}>
						{spec.levels.map((candidate) => (
							<VSCodeOption key={candidate} value={candidate}>
								{`${spec.levelWord} ${candidate}`}
							</VSCodeOption>
						))}
					</VSCodeDropdown>
				</div>
				{/* ⚠️ Switching this asks what a different level would look like; it does not restate the
				    programme's own. The activated profile is the default and is not changed by looking. */}
				{level !== levelLetterOf(profileLevel) && (
					<span className="text-[11px] text-[var(--vscode-charts-yellow)] max-w-[24rem] break-words">
						Showing {spec.levelWord} {level}. This project is activated at {spec.levelWord}{" "}
						{levelLetterOf(profileLevel) || "no level"} — looking here does not change it.
					</span>
				)}
				{loading && <VSCodeProgressRing style={{ width: 16, height: 16 }} />}
			</div>

			{error && (
				<p className="text-[12px] text-[var(--vscode-errorForeground)] m-0 break-words">
					Could not load {spec.label} status: {error}
				</p>
			)}

			{summary && !error && (
				<>
					<div className="flex gap-[20px] flex-wrap">
						<Count
							label={regime === "ecss" ? "expected outputs" : "requirements"}
							value={regime === "ecss" ? ecss!.applicableAtCategory : nasa!.applicableAtClass}
							hint={`Applicable at ${spec.levelWord} ${level}, of ${
								regime === "ecss" ? ecss!.outputsInStandard : nasa!.requirementsInMatrix
							} in the standard.`}
						/>
						{/* Each regime's distinctive count, and neither has the other's. */}
						{regime === "ecss" ? (
							<Count
								label="to be agreed"
								value={ecss!.toBeAgreed}
								hint="Rows Annex R marks Ytba: what the deliverable must contain is to be agreed with the customer. Neither owed in full nor excused."
							/>
						) : (
							<Count
								label="conditional"
								value={nasa!.conditional}
								hint="Requirements applying only where the project has identified safety-critical software. Appendix C does not record that determination, so Aerio does not assume it."
							/>
						)}
						<Count
							label="evidence recorded"
							value={summary.withPartialEvidence}
							hint="Rows Aerio holds a genuine input toward. Never a claim that the obligation is met."
						/>
						<Count
							label="nothing recorded"
							value={summary.withNoEvidence}
							hint="Applicable, with nothing held. Expected for most rows: most of a standard is process obligation no tool discharges."
						/>
						<Count
							label="out of scope"
							value={summary.outOfScopeForAerio}
							hint="Applicable to you and outside what a development tool contributes to."
						/>
					</div>

					<p className="text-[11px] text-[var(--vscode-descriptionForeground)] m-0 break-words">{summary.statement}</p>

					<div className="flex flex-col border-t border-[var(--vscode-panel-border)]">
						{rows.map((row) => (
							<div
								key={row.key}
								className="flex gap-[8px] items-start py-[6px] border-b border-[var(--vscode-panel-border)]">
								<span className="text-[11px] text-[var(--vscode-descriptionForeground)] min-w-[7.5rem] shrink-0 break-words">
									{row.id}
								</span>
								<span className="text-[12px] text-[var(--vscode-foreground)] flex-1 break-words">
									{row.title}
									{/* ⚠️ The standard's own force, where it says something the status does not.
									    This was computed and never rendered, under a comment asserting it was
									    shown — so the one row where the two genuinely differ (an expected output
									    marked Ytba that Aerio also holds evidence toward) read as a plain status
									    with the tailoring invisible. */}
									{row.force !== "required" && row.force !== row.status && (
										<span className="ml-[6px] text-[10px] text-[var(--vscode-descriptionForeground)] uppercase tracking-wide">
											{row.force === "not-applicable" ? "not applicable" : row.force.replace(/-/g, " ")}
										</span>
									)}
									{row.note && (
										<span className="block text-[11px] text-[var(--vscode-descriptionForeground)] break-words">
											{row.note}
										</span>
									)}
								</span>
								<span className="shrink-0">
									<Chip status={row.status} />
								</span>
							</div>
						))}
					</div>

					{/* Attribution travels with the data rather than living in a footer somebody edits
					    separately: it names the document, and states that Aerio claims no conformance. */}
					<p className="text-[10px] text-[var(--vscode-descriptionForeground)] m-0 break-words">
						{summary.attribution}
					</p>
				</>
			)}
		</div>
	)
}

export default memo(RegimeStatusDashboard)
