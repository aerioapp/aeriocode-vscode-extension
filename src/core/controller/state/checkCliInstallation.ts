import { Controller } from ".."
import { Boolean, EmptyRequest } from "@shared/proto/aeriocode/common"

export async function checkCliInstallation(_controller: Controller, _request: EmptyRequest): Promise<Boolean> {
	return Boolean.create({ value: false })
}
