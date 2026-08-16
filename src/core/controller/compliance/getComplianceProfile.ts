/* eslint-disable eslint-rules/no-direct-vscode-api -- the host bridge cannot serve this call site.
 *
 * ⚠️ An earlier version of this banner claimed this controller was "registered on the VS Code
 * protobus only". **That was false**, and the check behind it was bad: it grepped
 * `src/generated/hosts/vscode/` and stopped. This handler is registered on **both** hosts —
 * `src/generated/hosts/standalone/protobus-server-setup.ts` registers it too.
 *
 * The direct `vscode` use is still intended, for a reason that survives that correction. A
 * folder-scoped `getConfiguration` needs the workspace folder's own `Uri`;
 * `HostProvider.workspace.getWorkspacePaths` returns `fsPath` **strings**, and rebuilding a `Uri`
 * from one with `Uri.file()` would force the `file:` scheme and break remote and virtual
 * workspaces. There is no bridge call that returns what this needs.
 *
 * Under the standalone host this degrades rather than throwing, which was checked in the built
 * shim rather than assumed: `vscode.workspace.getConfiguration` is implemented there against an
 * in-memory store, and `vscode.workspace.workspaceFolders` is absent — which the optional chaining
 * below already handles, reporting `canPersist: false`.
 */
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
