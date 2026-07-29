import * as path from "path"
import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { OpenComplianceFindingRequest } from "@shared/proto/aeriocode/compliance"
import { openFileAtLine } from "@integrations/misc/open-file"
import { getWorkspacePath } from "@/utils/path"

/**
 * Open the file a finding refers to, with the cursor on the offending line.
 */
export async function openComplianceFinding(_controller: Controller, request: OpenComplianceFindingRequest): Promise<Empty> {
	const workspacePath = await getWorkspacePath()
	if (!workspacePath || !request.path) {
		return Empty.create({})
	}

	await openFileAtLine(path.resolve(workspacePath, request.path), request.line)
	return Empty.create({})
}
