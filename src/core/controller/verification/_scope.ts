import { VerificationScope } from "@shared/proto/aeriocode/verification"
import { resolveScope, type ComplianceScopeName } from "@/services/compliance/complianceFileScope"
import type { VerificationFile } from "@/services/verification/VerificationClient"
import * as fs from "fs/promises"

/**
 * Shared scope resolution for the verification controllers.
 *
 * Deliberately the same resolver the compliance panel uses. A user who has already decided what
 * "this workspace" means for a compliance check would be badly served by a second, subtly
 * different answer for coverage — and two resolvers would drift.
 */
const SCOPE_NAMES: Record<number, ComplianceScopeName> = {
	[VerificationScope.VERIFICATION_SCOPE_ACTIVE_FILE]: "activeFile",
	[VerificationScope.VERIFICATION_SCOPE_OPEN_EDITORS]: "openEditors",
	[VerificationScope.VERIFICATION_SCOPE_WORKSPACE]: "workspace",
}

/** Languages every registered pack targets, and the ones coverage instrumentation understands. */
const LANGUAGES = ["c", "cpp"]

/**
 * The files in a scope, read from disk.
 *
 * Read here rather than in the client so that a file that cannot be read is dropped with the rest
 * of the scope intact, instead of failing the whole request. A submission missing a file it could
 * not read is still a complete analysis of what it did contain — and the count comes back, so the
 * difference is visible.
 */
export async function filesInScope(
	scope: VerificationScope,
): Promise<{ files: VerificationFile[]; unreadable: number; label: string }> {
	const resolved = await resolveScope(SCOPE_NAMES[scope] ?? "activeFile", LANGUAGES)

	const files: VerificationFile[] = []
	let unreadable = 0

	for (const file of resolved.files) {
		try {
			files.push({ path: file.path, content: await fs.readFile(file.absolutePath, "utf8") })
		} catch {
			unreadable++
		}
	}

	return { files, unreadable, label: resolved.scopeLabel }
}
