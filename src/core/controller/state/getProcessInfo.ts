import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { ProcessInfo } from "@shared/proto/aeriocode/state"

export async function getProcessInfo(_controller: Controller, _request: EmptyRequest): Promise<ProcessInfo> {
	return ProcessInfo.create({})
}
