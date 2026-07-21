import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { memo, useCallback, useEffect, useState } from "react"
import { CertificationServiceClient } from "@/services/grpc-client"
import { EmptyRequest, StringRequest } from "@shared/proto/aeriocode/common"
import { AddRequirementRequest } from "@shared/proto/aeriocode/certification"
import RequirementDetail from "./RequirementDetail"

type Requirement = {
	id: number
	requirementId: string
	level: string
	title: string
	description: string
	dalLevel: string
	status: string
}

type LinkedFile = {
	path: string
	line: number
	type: string
}

type ViewMode = "list" | "detail" | "add"

const LEVEL_OPTIONS = [
	{ value: "system", label: "System" },
	{ value: "high_level", label: "High Level" },
	{ value: "low_level", label: "Low Level" },
	{ value: "derived", label: "Derived" },
]

const DAL_OPTIONS = ["A", "B", "C", "D", "E"]

const RequirementList = () => {
	const [requirements, setRequirements] = useState<Requirement[]>([])
	const [loading, setLoading] = useState(true)
	const [searchQuery, setSearchQuery] = useState("")
	const [viewMode, setViewMode] = useState<ViewMode>("list")
	const [selectedReq, setSelectedReq] = useState<Requirement | null>(null)
	const [linkedFiles, setLinkedFiles] = useState<LinkedFile[]>([])

	// Add form state
	const [formId, setFormId] = useState("")
	const [formLevel, setFormLevel] = useState("system")
	const [formTitle, setFormTitle] = useState("")
	const [formDescription, setFormDescription] = useState("")
	const [formDalLevel, setFormDalLevel] = useState("")
	const [formRationale, setFormRationale] = useState("")
	const [formSource, setFormSource] = useState("")
	const [formSaving, setFormSaving] = useState(false)
	const [formError, setFormError] = useState("")

	const fetchRequirements = useCallback(async () => {
		try {
			const response = await CertificationServiceClient.getRequirements(EmptyRequest.create({}))
			setRequirements(response.requirements || [])
		} catch (error) {
			console.error("Failed to fetch requirements:", error)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchRequirements()
	}, [fetchRequirements])

	const filteredReqs = requirements.filter(
		(req) =>
			req.requirementId.toLowerCase().includes(searchQuery.toLowerCase()) ||
			req.title.toLowerCase().includes(searchQuery.toLowerCase()),
	)

	const handleAddRequirement = async () => {
		if (!formId.trim() || !formTitle.trim()) return
		setFormSaving(true)
		setFormError("")
		try {
			await CertificationServiceClient.addRequirement(
				AddRequirementRequest.create({
					requirementId: formId.trim(),
					level: formLevel,
					title: formTitle.trim(),
					description: formDescription.trim(),
					dalLevel: formDalLevel || undefined,
					rationale: formRationale.trim() || undefined,
					source: formSource.trim() || undefined,
				}),
			)
			// Reset form and refresh list
			setFormId("")
			setFormLevel("system")
			setFormTitle("")
			setFormDescription("")
			setFormDalLevel("")
			setFormRationale("")
			setFormSource("")
			setViewMode("list")
			await fetchRequirements()
		} catch (error: any) {
			setFormError(error?.message || "Failed to add requirement")
		} finally {
			setFormSaving(false)
		}
	}

	const handleSelectRequirement = async (req: Requirement) => {
		setSelectedReq(req)
		setViewMode("detail")
		try {
			const response = await CertificationServiceClient.getTraceabilityLinks(
				StringRequest.create({ value: req.requirementId }),
			)
			setLinkedFiles(
				(response.links || []).map((link) => ({
					path: link.artifactPath || "",
					line: link.artifactLineStart || 0,
					type: link.linkType,
				})),
			)
		} catch (error) {
			console.error("Failed to fetch links:", error)
			setLinkedFiles([])
		}
	}

	if (loading) {
		return (
			<div className="flex justify-center items-center py-[40px] text-[var(--vscode-descriptionForeground)]">
				<span className="codicon codicon-loading codicon-modifier-spin" /> Loading...
			</div>
		)
	}

	// Detail view
	if (viewMode === "detail" && selectedReq) {
		return (
			<RequirementDetail
				requirement_id={selectedReq.requirementId}
				title={selectedReq.title}
				description={selectedReq.description}
				level={selectedReq.level}
				dal_level={selectedReq.dalLevel || null}
				status={selectedReq.status}
				linked_files={linkedFiles}
				onBack={() => {
					setViewMode("list")
					setSelectedReq(null)
					setLinkedFiles([])
				}}
				onLinkAdded={async () => {
					// Refresh linked files after adding a link
					try {
						const response = await CertificationServiceClient.getTraceabilityLinks(
							StringRequest.create({ value: selectedReq.requirementId }),
						)
						setLinkedFiles(
							(response.links || []).map((link) => ({
								path: link.artifactPath || "",
								line: link.artifactLineStart || 0,
								type: link.linkType,
							})),
						)
					} catch (error) {
						console.error("Failed to refresh links:", error)
					}
				}}
			/>
		)
	}

	// Add form view
	if (viewMode === "add") {
		return (
			<div className="flex flex-col gap-[12px] p-[12px] border border-[var(--vscode-focusBorder)] rounded bg-[var(--vscode-editor-background)]">
				<h4 className="text-[13px] text-[var(--vscode-foreground)] m-0">Add Requirement</h4>

				<div className="flex flex-col gap-[4px]">
					<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Requirement ID *</label>
					<VSCodeTextField
						placeholder="e.g., SYS-001 or HLR-42"
						value={formId}
						onInput={(e) => setFormId((e.target as HTMLInputElement).value)}
					/>
					<span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
						This ID must match the tag in your source code exactly (e.g., <code>// SYS-001: description</code>)
					</span>
				</div>

				<div className="flex flex-col gap-[4px]">
					<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Level *</label>
					<VSCodeDropdown value={formLevel} onChange={(e) => setFormLevel((e.target as HTMLSelectElement).value)}>
						{LEVEL_OPTIONS.map((opt) => (
							<VSCodeOption key={opt.value} value={opt.value}>
								{opt.label}
							</VSCodeOption>
						))}
					</VSCodeDropdown>
				</div>

				<div className="flex flex-col gap-[4px]">
					<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Title *</label>
					<VSCodeTextField
						placeholder="Requirement title"
						value={formTitle}
						onInput={(e) => setFormTitle((e.target as HTMLInputElement).value)}
					/>
				</div>

				<div className="flex flex-col gap-[4px]">
					<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Description</label>
					<VSCodeTextField
						placeholder="Detailed description (optional)"
						value={formDescription}
						onInput={(e) => setFormDescription((e.target as HTMLInputElement).value)}
					/>
				</div>

				<div className="flex flex-col gap-[4px]">
					<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">DAL Level</label>
					<VSCodeDropdown value={formDalLevel} onChange={(e) => setFormDalLevel((e.target as HTMLSelectElement).value)}>
						<VSCodeOption value="">None</VSCodeOption>
						{DAL_OPTIONS.map((dal) => (
							<VSCodeOption key={dal} value={dal}>
								{dal}
							</VSCodeOption>
						))}
					</VSCodeDropdown>
				</div>

				<div className="flex flex-col gap-[4px]">
					<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Rationale</label>
					<VSCodeTextField
						placeholder="Why this requirement exists (optional)"
						value={formRationale}
						onInput={(e) => setFormRationale((e.target as HTMLInputElement).value)}
					/>
				</div>

				<div className="flex flex-col gap-[4px]">
					<label className="text-[11px] text-[var(--vscode-descriptionForeground)]">Source</label>
					<VSCodeTextField
						placeholder="e.g., DO-178C §5.5.1 or Safety Analysis SA-001 (optional)"
						value={formSource}
						onInput={(e) => setFormSource((e.target as HTMLInputElement).value)}
					/>
				</div>

				{formError && <p className="text-[11px] text-[var(--vscode-errorForeground)] m-0">{formError}</p>}

				<div className="flex gap-[8px] justify-end mt-[4px]">
					<VSCodeButton appearance="secondary" onClick={() => setViewMode("list")}>
						Cancel
					</VSCodeButton>
					<VSCodeButton onClick={handleAddRequirement} disabled={!formId.trim() || !formTitle.trim() || formSaving}>
						{formSaving ? "Saving..." : "Add Requirement"}
					</VSCodeButton>
				</div>
			</div>
		)
	}

	// List view
	return (
		<div className="flex flex-col gap-[8px]">
			<div className="flex items-center gap-[8px] mb-[8px]">
				<VSCodeTextField
					placeholder="Search requirements..."
					value={searchQuery}
					onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
					className="flex-grow"
				/>
				<VSCodeButton onClick={() => setViewMode("add")}>
					<span className="codicon codicon-add mr-[4px]" /> Add
				</VSCodeButton>
			</div>

			{filteredReqs.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-[40px] text-[var(--vscode-descriptionForeground)]">
					<span className="codicon codicon-list-flat codicon-lg mb-[8px] text-[24px]" />
					<p className="text-[13px] m-0">No requirements found</p>
					<p className="text-[11px] m-0 mt-[4px]">Add requirements to enable traceability</p>
					<VSCodeButton className="mt-[12px]" onClick={() => setViewMode("add")}>
						<span className="codicon codicon-add mr-[4px]" /> Add First Requirement
					</VSCodeButton>
				</div>
			) : (
				<div className="flex flex-col gap-[4px]">
					{filteredReqs.map((req) => (
						<div
							key={req.requirementId}
							className="flex items-center gap-[8px] p-[8px] border border-[var(--vscode-panel-border)] rounded hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
							onClick={() => handleSelectRequirement(req)}>
							<div className="flex flex-col flex-grow min-w-0">
								<div className="flex items-center gap-[6px]">
									<span className="text-[12px] text-[var(--vscode-foreground)] font-medium">
										{req.requirementId}
									</span>
									<span
										className={`text-[10px] px-[4px] py-[1px] rounded ${req.status === "active" ? "bg-[var(--vscode-testing-iconPassed)]20 text-[var(--vscode-testing-iconPassed)]" : "bg-[var(--vscode-testing-iconFailed)]20 text-[var(--vscode-testing-iconFailed)]"}`}>
										{req.status}
									</span>
									{req.dalLevel && (
										<span className="text-[10px] px-[4px] py-[1px] bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
											{req.dalLevel}
										</span>
									)}
								</div>
								<span className="text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
									{req.title}
								</span>
							</div>
							<span className="codicon codicon-chevron-right text-[var(--vscode-descriptionForeground)]" />
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export default memo(RequirementList)
