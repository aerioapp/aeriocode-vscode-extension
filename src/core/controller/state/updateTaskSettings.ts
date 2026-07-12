import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { UpdateTaskSettingsRequest } from "@shared/proto/aeriocode/state"

export async function updateTaskSettings(_controller: Controller, _request: UpdateTaskSettingsRequest): Promise<Empty> {
	return Empty.create({})
}
