import { Controller } from ".."
import { Empty } from "@shared/proto/aeriocode/common"
import { UpdateSettingsRequestCli } from "@shared/proto/aeriocode/state"

export async function updateSettingsCli(_controller: Controller, _request: UpdateSettingsRequestCli): Promise<Empty> {
	return Empty.create({})
}
