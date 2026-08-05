import {
	VSCodeButton,
	VSCodeDivider,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeProgressRing,
	VSCodeTextArea,
} from "@vscode/webview-ui-toolkit/react"
import { useCallback, useState } from "react"
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import {
	AnalyzeCoverageRequest,
	type AnalyzeCoverageResponse,
	BuildTraceabilityMatrixRequest,
	type BuildTraceabilityMatrixResponse,
	GenerateDocumentRequest,
	type GenerateDocumentResponse,
	GenerateTestsRequest,
	type GenerateTestsResponse,
	type ImportedRequirement,
	ImportRequirementsRequest,
	type ImportRequirementsResponse,
	InstrumentForCoverageRequest,
	type InstrumentForCoverageResponse,
	type QualificationPositionResponse,
	VerificationScope,
} from "@shared/proto/aeriocode/verification"
import { VerificationServiceClient } from "@/services/grpc-client"

/**
 * The DO-178C verification tools.
 *
 * Five backend services shipped complete and reachable only over REST — structural coverage, ReqIF
 * traceability, requirements-based test generation, DO-178C document drafts, and the DO-330
 * qualification kit. This is the surface that makes them reachable.
 *
 * ## Why one view with tabs rather than five views
 *
 * They are one workflow, and the order matters: instrument, run on the target, submit the trace,
 * import the requirements baseline, build the matrix, generate the artifacts. Each step's output
 * feeds the next. Five separate views would have hidden that sequence and left the user to
 * reconstruct it — and the baseline imported in one view would not have been visible to the next.
 *
 * ## What this view refuses to do
 *
 * It does not write instrumented source over the user's files. Instrumented source is a build
 * artifact, and silently replacing a developer's working tree with a rewritten copy is the one
 * thing a tool aimed at certified software must never do.
 *
 * It does not soften any of the statements the backend attaches to a result. "No objective is
 * reported as satisfied", "endpoints covered is not proof the coupling was exercised", "this is a
 * draft skeleton, not a submittable document" — each is the load-bearing part of the answer, and a
 * panel that showed the number without the sentence would be the tool overstating itself through
 * its own UI.
 */

type Tab = "coverage" | "requirements" | "tests" | "documents" | "qualification"

const TABS: Array<{ id: Tab; label: string; blurb: string }> = [
	{
		id: "coverage",
		label: "Coverage",
		blurb: "Statement, decision and MC/DC coverage from an instrumented run on your target.",
	},
	{
		id: "requirements",
		label: "Requirements",
		blurb: "Import a ReqIF baseline and trace it against the code, in both directions.",
	},
	{
		id: "tests",
		label: "Tests",
		blurb: "Generate requirements-based test cases. The expected result is left for you to fill in.",
	},
	{
		id: "documents",
		label: "Documents",
		blurb: "DO-178C life cycle document drafts. Sections Aerio cannot fill are left empty and marked.",
	},
	{
		id: "qualification",
		label: "Qualification",
		blurb: "Aerio's DO-330 position: Criteria 3 at TQL-5, and why not Criteria 1.",
	},
]

const DOCUMENT_IDS = ["PSAC", "SDP", "SVP", "SCMP", "SQAP", "SRS", "SDS", "SCS", "SVCP", "SVR", "SAS"]

const SCOPES: Array<{ value: VerificationScope; label: string }> = [
	{ value: VerificationScope.VERIFICATION_SCOPE_ACTIVE_FILE, label: "Active file" },
	{ value: VerificationScope.VERIFICATION_SCOPE_OPEN_EDITORS, label: "Open editors" },
	{ value: VerificationScope.VERIFICATION_SCOPE_WORKSPACE, label: "Whole workspace" },
]

interface VerificationViewProps {
	onDone: () => void
}

/** A statement the backend attached to a result. Rendered as prominently as the numbers it qualifies. */
function Statement({ children }: { children: React.ReactNode }) {
	return (
		<p
			style={{
				margin: "8px 0",
				padding: "8px 10px",
				borderLeft: "3px solid var(--vscode-textLink-foreground)",
				background: "var(--vscode-textBlockQuote-background)",
				fontSize: "12px",
				lineHeight: 1.5,
			}}>
			{children}
		</p>
	)
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div style={{ minWidth: 130, marginRight: 18, marginBottom: 10 }}>
			<div style={{ fontSize: 11, opacity: 0.75 }}>{label}</div>
			<div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
			{hint && <div style={{ fontSize: 11, opacity: 0.65 }}>{hint}</div>}
		</div>
	)
}

export default function VerificationView({ onDone }: VerificationViewProps) {
	const [tab, setTab] = useState<Tab>("coverage")
	const [scope, setScope] = useState<VerificationScope>(VerificationScope.VERIFICATION_SCOPE_WORKSPACE)
	const [busy, setBusy] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const [instrumented, setInstrumented] = useState<InstrumentForCoverageResponse | null>(null)
	const [trace, setTrace] = useState("")
	const [coverage, setCoverage] = useState<AnalyzeCoverageResponse | null>(null)

	const [reqifPath, setReqifPath] = useState("")
	const [imported, setImported] = useState<ImportRequirementsResponse | null>(null)
	const [matrix, setMatrix] = useState<BuildTraceabilityMatrixResponse | null>(null)

	const [generated, setGenerated] = useState<GenerateTestsResponse | null>(null)

	const [documentId, setDocumentId] = useState("PSAC")
	const [document, setDocument] = useState<GenerateDocumentResponse | null>(null)

	const [qualification, setQualification] = useState<QualificationPositionResponse | null>(null)

	/**
	 * Run one request.
	 *
	 * Every response carries an `error` string rather than throwing, because a panel needs to render
	 * "you are signed out" as a message and not as an empty result that reads as "there is nothing
	 * here". This unwraps that consistently so no call site can forget to.
	 */
	const run = useCallback(async function <T extends { error: string }>(
		label: string,
		request: Promise<T>,
		onOk: (value: T) => void,
	) {
		setBusy(label)
		setError(null)
		try {
			const response = await request
			if (response.error) {
				setError(response.error)
				return
			}
			onOk(response)
		} catch (caught) {
			setError((caught as Error)?.message ?? String(caught))
		} finally {
			setBusy(null)
		}
	}, [])

	const requirementsForRequest = (imported?.requirements ?? []) as ImportedRequirement[]

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden" style={{ padding: "10px 0 0 20px" }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 17 }}>
				<h3 style={{ margin: 0 }}>Verification</h3>
				<VSCodeButton onClick={onDone}>Done</VSCodeButton>
			</div>

			<div style={{ display: "flex", gap: 4, marginTop: 12, flexWrap: "wrap", paddingRight: 17 }}>
				{TABS.map((entry) => (
					<VSCodeButton
						key={entry.id}
						appearance={tab === entry.id ? "primary" : "secondary"}
						onClick={() => {
							setTab(entry.id)
							setError(null)
						}}>
						{entry.label}
					</VSCodeButton>
				))}
			</div>

			<p style={{ fontSize: 12, opacity: 0.8, marginTop: 10, paddingRight: 17 }}>
				{TABS.find((entry) => entry.id === tab)?.blurb}
			</p>

			{error && (
				<p
					style={{
						margin: "6px 17px 6px 0",
						padding: "8px 10px",
						background: "var(--vscode-inputValidation-errorBackground)",
						border: "1px solid var(--vscode-inputValidation-errorBorder)",
						fontSize: 12,
					}}>
					{error}
				</p>
			)}

			<div className="flex-1 overflow-y-auto" style={{ paddingRight: 17, paddingBottom: 20 }}>
				{busy && (
					<div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
						<VSCodeProgressRing style={{ width: 16, height: 16 }} />
						<span style={{ fontSize: 12 }}>{busy}</span>
					</div>
				)}

				{/* ---- Coverage -------------------------------------------------------------- */}
				{tab === "coverage" && (
					<>
						<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
							<VSCodeDropdown
								value={String(scope)}
								onChange={(event) =>
									setScope(Number((event.target as HTMLSelectElement).value) as VerificationScope)
								}>
								{SCOPES.map((entry) => (
									<VSCodeOption key={entry.value} value={String(entry.value)}>
										{entry.label}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
							<VSCodeButton
								disabled={busy !== null}
								onClick={() =>
									run(
										"Instrumenting…",
										VerificationServiceClient.instrumentForCoverage(
											InstrumentForCoverageRequest.create({ scope }),
										),
										setInstrumented,
									)
								}>
								Instrument
							</VSCodeButton>
						</div>

						{instrumented && (
							<>
								<div style={{ display: "flex", flexWrap: "wrap" }}>
									<Figure label="Build id" value={instrumented.buildId} />
									<Figure label="Statements" value={String(instrumented.statements)} />
									<Figure label="Decisions" value={String(instrumented.decisions)} />
									<Figure label="Conditions" value={String(instrumented.conditions)} />
									<Figure
										label="Runtime storage"
										value={`${instrumented.storageBytes} B`}
										hint="on the target"
									/>
								</div>
								{instrumented.decisionsWithoutMcdc > 0 && (
									<Statement>
										{instrumented.decisionsWithoutMcdc} decision(s) have more conditions than the runtime's
										vector can represent. They are instrumented for decision coverage only, and their MC/DC is
										reported as not determinable rather than guessed at.
									</Statement>
								)}
								<Statement>{instrumented.note}</Statement>
								<ol style={{ fontSize: 12, lineHeight: 1.6 }}>
									{instrumented.integrationSteps.map((step) => (
										<li key={step}>{step}</li>
									))}
								</ol>

								<VSCodeDivider style={{ margin: "14px 0" }} />
								<p style={{ fontSize: 12, marginBottom: 4 }}>
									Paste the base64 trace your instrumented build emitted:
								</p>
								<VSCodeTextArea
									value={trace}
									rows={4}
									style={{ width: "100%" }}
									onInput={(event) => setTrace((event.target as HTMLTextAreaElement).value)}
								/>
								<VSCodeButton
									style={{ marginTop: 8 }}
									disabled={busy !== null || trace.trim() === ""}
									onClick={() =>
										run(
											"Analysing the trace…",
											VerificationServiceClient.analyzeCoverage(
												AnalyzeCoverageRequest.create({
													buildId: instrumented.buildId,
													traceBase64: trace.trim(),
												}),
											),
											setCoverage,
										)
									}>
									Analyse coverage
								</VSCodeButton>
							</>
						)}

						{coverage && (
							<>
								<VSCodeDivider style={{ margin: "14px 0" }} />
								<div style={{ display: "flex", flexWrap: "wrap" }}>
									<Figure
										label="Statement"
										value={`${coverage.statementPercentage.toFixed(1)}%`}
										hint={`${coverage.statementsCovered} of ${coverage.statementsTotal}`}
									/>
									<Figure
										label="Decision"
										value={`${coverage.decisionPercentage.toFixed(1)}%`}
										hint={`${coverage.decisionsNotDeterminable} not determinable`}
									/>
									<Figure
										label="MC/DC unique-cause"
										value={`${(coverage.mcdcUniqueCause?.percentage ?? 0).toFixed(1)}%`}
										hint={`${coverage.mcdcUniqueCause?.satisfied ?? 0} of ${coverage.mcdcUniqueCause?.total ?? 0}`}
									/>
									<Figure
										label="MC/DC masking"
										value={`${(coverage.mcdcMasking?.percentage ?? 0).toFixed(1)}%`}
										hint={`${coverage.mcdcMasking?.satisfied ?? 0} of ${coverage.mcdcMasking?.total ?? 0}`}
									/>
								</div>
								{/* Both forms, side by side, with the sentence that says why neither is picked for you. */}
								<Statement>{coverage.methodStatement}</Statement>
								<Statement>{coverage.testBasisStatement}</Statement>
								{coverage.uncovered.length > 0 && (
									<>
										<p style={{ fontSize: 12, fontWeight: 600, marginTop: 12 }}>Uncovered statements</p>
										<ul style={{ fontSize: 12, lineHeight: 1.6 }}>
											{coverage.uncovered.slice(0, 40).map((entry) => (
												<li key={entry.id}>
													<code>
														{entry.file}:{entry.line}
													</code>{" "}
													{entry.text}
												</li>
											))}
										</ul>
									</>
								)}
								<p style={{ fontSize: 11, opacity: 0.75, marginTop: 12 }}>
									What this measurement does not establish:
								</p>
								<ul style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.5 }}>
									{coverage.limits.map((limit) => (
										<li key={limit}>{limit}</li>
									))}
								</ul>
							</>
						)}
					</>
				)}

				{/* ---- Requirements ---------------------------------------------------------- */}
				{tab === "requirements" && (
					<>
						<p style={{ fontSize: 12, marginBottom: 4 }}>
							Path to a ReqIF file exported from your requirements tool:
						</p>
						<VSCodeTextArea
							value={reqifPath}
							rows={1}
							style={{ width: "100%" }}
							onInput={(event) => setReqifPath((event.target as HTMLTextAreaElement).value)}
						/>
						<VSCodeButton
							style={{ marginTop: 8 }}
							disabled={busy !== null || reqifPath.trim() === ""}
							onClick={() =>
								run(
									"Importing…",
									VerificationServiceClient.importRequirements(
										ImportRequirementsRequest.create({ filePath: reqifPath.trim() }),
									),
									setImported,
								)
							}>
							Import baseline
						</VSCodeButton>

						{imported && (
							<>
								<div style={{ display: "flex", flexWrap: "wrap", marginTop: 12 }}>
									<Figure
										label="Imported"
										value={String(imported.imported)}
										hint={`of ${imported.specObjects} objects`}
									/>
									<Figure label="With a parent" value={String(imported.withParent)} />
									<Figure label="Skipped" value={String(imported.skipped)} />
								</div>

								<div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
									<VSCodeDropdown
										value={String(scope)}
										onChange={(event) =>
											setScope(Number((event.target as HTMLSelectElement).value) as VerificationScope)
										}>
										{SCOPES.map((entry) => (
											<VSCodeOption key={entry.value} value={String(entry.value)}>
												{entry.label}
											</VSCodeOption>
										))}
									</VSCodeDropdown>
									<VSCodeButton
										disabled={busy !== null}
										onClick={() =>
											run(
												"Building the matrix…",
												VerificationServiceClient.buildTraceabilityMatrix(
													BuildTraceabilityMatrixRequest.create({
														scope,
														requirements: requirementsForRequest,
													}),
												),
												setMatrix,
											)
										}>
										Build traceability matrix
									</VSCodeButton>
								</div>
							</>
						)}

						{matrix && (
							<>
								<VSCodeDivider style={{ margin: "14px 0" }} />
								<div style={{ display: "flex", flexWrap: "wrap" }}>
									<Figure label="Requirements" value={String(matrix.requirements)} />
									<Figure label="Implemented" value={String(matrix.implemented)} />
									<Figure label="Verified" value={String(matrix.verified)} />
									<Figure label="Derived" value={String(matrix.derived)} hint="need a safety assessment" />
									<Figure label="Orphaned tags" value={String(matrix.orphanedTags)} />
									<Figure label="Untagged files" value={String(matrix.filesWithNoTag)} />
								</div>
								{/* The sentence that stops "untagged" being read as "unintended functionality". */}
								<Statement>{matrix.reverseStatement}</Statement>
								<Statement>{matrix.derivedStatement}</Statement>
								<ul style={{ fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>
									{matrix.rows.slice(0, 60).map((row) => (
										<li key={row.requirementId}>
											<strong>{row.requirementId}</strong> {row.title} —{" "}
											{row.implemented ? "implemented" : "not implemented"},{" "}
											{row.verified ? "verified" : "not verified"}
											{row.isDerived ? ", derived" : ""}
											{row.qualityQuestions > 0 ? `, ${row.qualityQuestions} question(s)` : ""}
										</li>
									))}
								</ul>
							</>
						)}
					</>
				)}

				{/* ---- Tests ------------------------------------------------------------------ */}
				{tab === "tests" && (
					<>
						{!imported && (
							<p style={{ fontSize: 12 }}>Import a requirements baseline first, on the Requirements tab.</p>
						)}
						{imported && (
							<VSCodeButton
								disabled={busy !== null}
								onClick={() =>
									run(
										"Generating cases…",
										VerificationServiceClient.generateRequirementsBasedTests(
											GenerateTestsRequest.create({
												requirements: requirementsForRequest,
												includeSkeletons: true,
											}),
										),
										setGenerated,
									)
								}>
								Generate test cases
							</VSCodeButton>
						)}

						{generated && (
							<>
								<div style={{ display: "flex", flexWrap: "wrap", marginTop: 12 }}>
									<Figure label="Cases" value={String(generated.cases.length)} />
									<Figure label="Skeletons" value={String(generated.skeletons.length)} />
								</div>
								{/* A boundary derived from int32_t is derived from the type, not from a requirement. */}
								<Statement>{generated.basisStatement}</Statement>
								<ul style={{ fontSize: 12, lineHeight: 1.6 }}>
									{generated.cases.slice(0, 60).map((testCase) => (
										<li key={testCase.testId}>
											<strong>{testCase.requirementId}</strong> — {testCase.name}{" "}
											<em>({testCase.basis})</em>
										</li>
									))}
								</ul>
								<ul style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.5, marginTop: 10 }}>
									{generated.limits.map((limit) => (
										<li key={limit}>{limit}</li>
									))}
								</ul>
							</>
						)}
					</>
				)}

				{/* ---- Documents --------------------------------------------------------------- */}
				{tab === "documents" && (
					<>
						<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
							<VSCodeDropdown
								value={documentId}
								onChange={(event) => setDocumentId((event.target as HTMLSelectElement).value)}>
								{DOCUMENT_IDS.map((id) => (
									<VSCodeOption key={id} value={id}>
										{id}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
							<VSCodeButton
								disabled={busy !== null}
								onClick={() =>
									run(
										"Drafting…",
										VerificationServiceClient.generateCertificationDocument(
											GenerateDocumentRequest.create({ documentId }),
										),
										setDocument,
									)
								}>
								Draft document
							</VSCodeButton>
						</div>

						{document && (
							<>
								<h4 style={{ marginBottom: 2, marginTop: 14 }}>
									{document.documentId} — {document.title}
								</h4>
								<div style={{ fontSize: 11, opacity: 0.7 }}>DO-178C {document.clause}</div>
								<div style={{ display: "flex", flexWrap: "wrap", marginTop: 10 }}>
									<Figure label="Sections filled" value={String(document.sectionsGenerated)} />
									<Figure label="For the applicant" value={String(document.sectionsForApplicant)} />
									<Figure label="Content hash" value={document.contentHash.slice(0, 12)} />
								</div>
								{/* Never softened. A draft that read as submittable would be found out at the review. */}
								<Statement>{document.completenessStatement}</Statement>
								<ul style={{ fontSize: 12, lineHeight: 1.6 }}>
									{document.sections.map((section) => (
										<li key={section.id}>
											<strong>{section.title}</strong>{" "}
											<span style={{ opacity: 0.7 }}>({section.clause})</span>{" "}
											{section.filled ? (
												<span style={{ color: "var(--vscode-charts-green)" }}>
													filled from Aerio's data
												</span>
											) : (
												<span style={{ color: "var(--vscode-charts-orange)" }}>
													to be supplied by the applicant
												</span>
											)}
											{section.note && <div style={{ fontSize: 11, opacity: 0.75 }}>{section.note}</div>}
										</li>
									))}
								</ul>
							</>
						)}
					</>
				)}

				{/* ---- Qualification ----------------------------------------------------------- */}
				{tab === "qualification" && (
					<>
						<VSCodeButton
							disabled={busy !== null}
							onClick={() =>
								run(
									"Loading…",
									VerificationServiceClient.getQualificationPosition(EmptyRequest.create({})),
									setQualification,
								)
							}>
							Load qualification position
						</VSCodeButton>

						{qualification && (
							<>
								<div style={{ display: "flex", flexWrap: "wrap", marginTop: 12 }}>
									<Figure label="DO-330 criteria" value={String(qualification.criteria)} />
									<Figure label="Qualification level" value={`TQL-${qualification.tql}`} />
									<Figure label="Tool requirements" value={String(qualification.requirements.length)} />
								</div>
								<Statement>{qualification.basis}</Statement>
								{/* Stated so the stronger claim cannot be made by accident in a sales conversation. */}
								<Statement>{qualification.whyNotCriteria1}</Statement>
								<Statement>{qualification.applicantObligation}</Statement>
								<ul style={{ fontSize: 12, lineHeight: 1.6 }}>
									{qualification.requirements.map((requirement) => (
										<li key={requirement.id}>
											<strong>{requirement.id}</strong> {requirement.title} —{" "}
											<span
												style={{
													color:
														requirement.verificationStatus === "verified"
															? "var(--vscode-charts-green)"
															: "var(--vscode-charts-orange)",
												}}>
												{requirement.verificationStatus}
											</span>{" "}
											<span style={{ opacity: 0.7 }}>
												({requirement.casesPassed}/{requirement.casesRun} cases
												{requirement.casesSkipped > 0 ? `, ${requirement.casesSkipped} skipped` : ""})
											</span>
										</li>
									))}
								</ul>
							</>
						)}
					</>
				)}
			</div>
		</div>
	)
}
