import * as vscode from "vscode"
import { Controller } from ".."
import { ComplianceProfileResponse, SetComplianceProfileRequest } from "../../../shared/proto/aeriocode/compliance"
import { ASIL_LEVELS, DAL_LEVELS, resolveComplianceProfile } from "@/services/compliance/ComplianceProfileResolver"

/**
 * Set the standard and level for the workspace.
 *
 * Writes the same `aeriocode.compliance.*` settings a user would edit by hand, at
 * {@link vscode.ConfigurationTarget.WorkspaceFolder} scope. Two routes to one stored value rather
 * than a second store the picker owns: a picker with its own state would drift from the settings
 * file the moment anybody edited either, and the resolver reads the settings.
 *
 * ⚠️ Folder scope, not global. The standard belongs to the code, not to the developer — that was the
 * defect in the original design, where it rode on an account-level model id and followed whoever was
 * logged in. Writing this globally would reintroduce it through the front door.
 *
 * The response is the *resolved* profile, not an echo of the request. If a level is dropped as
 * invalid for the regime, the picker has to show what is actually in force rather than what was
 * asked for.
 */
export async function setComplianceProfile(
	_controller: Controller,
	request: SetComplianceProfileRequest,
): Promise<ComplianceProfileResponse> {
	const folder = vscode.workspace.workspaceFolders?.[0]
	if (!folder) {
		// Nothing to write to. Reported rather than written globally as a fallback: a standard that
		// silently applied to every future workspace is exactly the failure folder scope prevents.
		return ComplianceProfileResponse.create({
			standard: "",
			level: "",
			regime: "do-178c",
			gateEnabled: true,
			canPersist: false,
			levelSource: "none",
		})
	}

	const config = vscode.workspace.getConfiguration("aeriocode.compliance", folder.uri)
	const standard = (request.standard || "").trim()
	const regime = request.regime === "iso-26262" ? "iso-26262" : "do-178c"

	// A level from the wrong regime is dropped here as well as in the resolver. The resolver would
	// drop it on read anyway, but storing it would leave the settings file asserting something the
	// product does not honour, which is the kind of quiet disagreement this module exists to avoid.
	const valid: readonly string[] = regime === "iso-26262" ? ASIL_LEVELS : DAL_LEVELS
	const rawLevel = (request.level || "").trim()
	const level = valid.includes(rawLevel) ? rawLevel : ""

	const target = vscode.ConfigurationTarget.WorkspaceFolder
	await config.update("standard", standard, target)
	await config.update("regime", regime, target)
	await config.update("level", level, target)
	await config.update("gateEnabled", request.gateEnabled, target)

	const resolved = resolveComplianceProfile(folder.uri)
	return ComplianceProfileResponse.create({
		standard: resolved?.standard ?? "",
		level: resolved?.level ?? "",
		regime: resolved?.regime ?? "do-178c",
		gateEnabled: config.get<boolean>("gateEnabled") ?? true,
		canPersist: true,
		levelSource: resolved?.levelSource ?? "none",
	})
}
