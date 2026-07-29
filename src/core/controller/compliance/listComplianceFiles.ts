import { Controller } from ".."
import {
	ComplianceFile,
	ComplianceFilesResponse,
	ComplianceScope,
	ListComplianceFilesRequest,
} from "@shared/proto/aeriocode/compliance"
import { ComplianceClient } from "@/services/compliance/ComplianceClient"
import { MAX_FILES, MAX_TOTAL_BYTES, resolveScope, type ComplianceScopeName } from "@/services/compliance/complianceFileScope"
import { AeriocodeIgnoreController } from "@/core/ignore/AeriocodeIgnoreController"
import { getWorkspacePath } from "@/utils/path"

const SCOPE_NAMES: Record<ComplianceScope, ComplianceScopeName> = {
	[ComplianceScope.COMPLIANCE_SCOPE_ACTIVE_FILE]: "activeFile",
	[ComplianceScope.COMPLIANCE_SCOPE_OPEN_EDITORS]: "openEditors",
	[ComplianceScope.COMPLIANCE_SCOPE_ACTIVE_FOLDER]: "activeFolder",
	[ComplianceScope.COMPLIANCE_SCOPE_WORKSPACE]: "workspace",
	[ComplianceScope.UNRECOGNIZED]: "activeFile",
}

/**
 * Resolve a scope into the concrete files that would be checked.
 *
 * The panel renders this as a checklist the user confirms before running, because
 * analysis uploads file contents. Files blocked by .aeriocodeignore are listed but marked
 * unselectable rather than hidden — silently omitting them would leave the user believing
 * their whole folder was checked.
 */
export async function listComplianceFiles(
	_controller: Controller,
	request: ListComplianceFilesRequest,
): Promise<ComplianceFilesResponse> {
	// The standard decides which file types are worth offering. If it cannot be resolved
	// (offline, signed out), fall back to C/C++ — every registered standard targets it,
	// and offering the usual list beats offering nothing.
	let languages = ["cpp"]
	try {
		const standards = await ComplianceClient.getInstance().listStandards()
		const matched = standards.find((standard) => standard.id === request.standard)
		if (matched) {
			languages = matched.languages
		}
	} catch {
		// Keep the fallback.
	}

	const resolved = await resolveScope(SCOPE_NAMES[request.scope] ?? "activeFile", languages)

	const workspacePath = await getWorkspacePath()
	const ignoreController = workspacePath ? new AeriocodeIgnoreController(workspacePath) : null
	if (ignoreController) {
		await ignoreController.initialize()
	}

	const files = resolved.files.map((file) => {
		const allowed = ignoreController ? ignoreController.validateAccess(file.path) : true
		return ComplianceFile.create({
			path: file.path,
			absolutePath: file.absolutePath,
			sizeBytes: file.sizeBytes,
			selectable: allowed,
			blockedReason: allowed ? "" : "Blocked by .aeriocodeignore",
		})
	})

	return ComplianceFilesResponse.create({
		files,
		scopeLabel: resolved.scopeLabel,
		emptyReason: resolved.emptyReason,
		excludedOverLimit: resolved.excludedOverLimit,
		maxFiles: MAX_FILES,
		maxTotalBytes: MAX_TOTAL_BYTES,
	})
}
