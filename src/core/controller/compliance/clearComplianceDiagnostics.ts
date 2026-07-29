import { Controller } from ".."
import { Empty, EmptyRequest } from "@shared/proto/aeriocode/common"
import { ComplianceDiagnostics } from "@/services/compliance/ComplianceDiagnostics"

/**
 * Remove every published compliance diagnostic.
 */
export async function clearComplianceDiagnostics(_controller: Controller, _request: EmptyRequest): Promise<Empty> {
	ComplianceDiagnostics.getInstance().clear()
	return Empty.create({})
}
