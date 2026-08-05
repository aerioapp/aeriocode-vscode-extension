import * as vscode from "vscode"
import { Controller } from ".."
import { EmptyRequest } from "../../../shared/proto/aeriocode/common"
import { ComplianceProfileResponse } from "../../../shared/proto/aeriocode/compliance"
import { resolveComplianceProfile } from "@/services/compliance/ComplianceProfileResolver"

/**
 * What standard is actually in force.
 *
 * Read through `resolveComplianceProfile`, the same function the request path and the gate use,
 * rather than from the settings keys directly. A picker that read the raw settings could show a
 * level the resolver rejects — an ASIL against DO-178C, say — and the user would see a profile the
 * model was never instructed under. A picker disagreeing with what is enforced is worse than no
 * picker, because it converts an invisible problem into a confidently wrong answer.
 */
export async function getComplianceProfile(_controller: Controller, _request: EmptyRequest): Promise<ComplianceProfileResponse> {
	const folder = vscode.workspace.workspaceFolders?.[0]
	const profile = resolveComplianceProfile(folder?.uri)
	const config = vscode.workspace.getConfiguration("aeriocode.compliance", folder?.uri ?? null)

	return ComplianceProfileResponse.create({
		standard: profile?.standard ?? "",
		level: profile?.level ?? "",
		regime: profile?.regime ?? "do-178c",
		gateEnabled: config.get<boolean>("gateEnabled") ?? true,
		// Without a folder there is nowhere workspace-scoped to write, and a choice that silently
		// went nowhere would be the same class of failure this picker exists to remove.
		canPersist: Boolean(folder),
		levelSource: profile?.levelSource ?? "none",
	})
}
